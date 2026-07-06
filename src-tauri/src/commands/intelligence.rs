//! Intelligence-track commands: round execution and run history.
//!
//! `run_agent_round` is the legacy Coral-round compatibility flow (deterministic
//! engine in `services::coral::market`) kept per
//! docs/adr/0006-lean-agent-runtime-no-agent-theatre.md until the autonomous
//! Match Intelligence runtime replaces it in PR 5. Run history is SQLite-backed
//! so every phase stays auditable after restart.

use tauri::{AppHandle, Emitter, State};

use crate::error::AppError;
use crate::event_bus;
use crate::services::chain;
use crate::services::coral;
use crate::services::solana_pay;
use crate::state::DesktopState;
use crate::types::{
    now_iso, AgentRun, MarketRoundEvent, SettlementReceipt, TrackMode, TxLineEvent, VerdictStatus,
};

#[tauri::command]
pub async fn run_agent_round(
    trigger: TxLineEvent,
    track: TrackMode,
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<AgentRun, AppError> {
    // The market engine produces a complete deterministic run first. Settlement
    // and chain observation enrich it afterwards.
    let mut run = coral::market::run_round(trigger, track);

    if verifier_passed(&run) {
        match solana_pay::create_intent(&state.config, &run) {
            Ok(intent) => {
                if let Some(yellowstone) = &state.yellowstone {
                    yellowstone.watch_reference(intent.reference.clone());
                }
                merge_receipt(&mut run, solana_pay::receipt_from_intent(&intent));
                coral::market::append_timeline(
                    &mut run,
                    "SOLANA_PAY",
                    format!(
                        "created devnet transfer request for {} SOL with reference {}",
                        intent.amount_sol, intent.reference
                    ),
                );
                {
                    let ledger = state
                        .ledger
                        .lock()
                        .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
                    ledger.upsert_payment_intent(&intent)?;
                }
                let _ = app.emit(event_bus::PAY_INTENT, &intent);
            }
            Err(err) => {
                coral::market::append_timeline(
                    &mut run,
                    "SOLANA_PAY",
                    format!("payment intent unavailable: {err}"),
                );
            }
        }
    }

    if let Some(reference) = run
        .settlement
        .as_ref()
        .and_then(|settlement| settlement.reference.clone())
    {
        match state
            .settlement_bridge
            .settle_run(&state.config, &run)
            .await
        {
            Ok(receipt) => {
                // Settlement success updates both the run timeline and live UI
                // event stream. The webview sees receipts, not secrets.
                let settled_reference = receipt
                    .reference
                    .clone()
                    .or_else(|| {
                        run.settlement
                            .as_ref()
                            .and_then(|settlement| settlement.reference.clone())
                    })
                    .unwrap_or_else(|| reference.clone());
                let detail = format!("CoralOS sidecar settled reference {}", settled_reference);
                merge_receipt(&mut run, receipt);
                coral::market::append_timeline(&mut run, "CORALOS", detail);
                if let Some(receipt) = run.settlement.as_ref() {
                    let _ = app.emit(event_bus::SETTLE_RECEIPT, receipt);
                    if let Some(yellowstone) = &state.yellowstone {
                        if let Some(account) = receipt.escrow_pda.clone() {
                            yellowstone.watch_account(account);
                        }
                        if let Some(reference) = receipt.reference.clone() {
                            yellowstone.watch_reference(reference);
                        }
                    }
                }
            }
            Err(err) => {
                // Settlement is non-fatal for demoability: the run remains
                // inspectable and records why CoralOS was unavailable.
                coral::market::append_timeline(
                    &mut run,
                    "CORALOS",
                    format!("sidecar settlement unavailable: {err}"),
                );
            }
        }

        if let Some(payment_reference) = run
            .settlement
            .as_ref()
            .and_then(|settlement| settlement.payment_reference.clone())
        {
            let intent = {
                let ledger = state
                    .ledger
                    .lock()
                    .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
                ledger
                    .get_payment_intent_by_reference(&payment_reference)
                    .ok()
            };
            if let Some(intent) = intent {
                match solana_pay::verify_intent(&state.client, &state.config, intent).await {
                    Ok(updated) => {
                        merge_receipt(&mut run, solana_pay::receipt_from_intent(&updated));
                        {
                            let ledger = state
                                .ledger
                                .lock()
                                .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
                            ledger.upsert_payment_intent(&updated)?;
                        }
                        coral::market::append_timeline(
                            &mut run,
                            "SOLANA_PAY",
                            format!(
                                "{} payment reference {}",
                                updated.status_text(),
                                updated.reference
                            ),
                        );
                        let _ = app.emit(event_bus::PAY_STATUS, &updated);
                    }
                    Err(err) => {
                        coral::market::append_timeline(
                            &mut run,
                            "SOLANA_PAY",
                            format!("payment reference verification unavailable: {err}"),
                        );
                    }
                }
            }
        }

        let escrow_account = run
            .settlement
            .as_ref()
            .and_then(|settlement| settlement.escrow_pda.clone());
        let reference = run
            .settlement
            .as_ref()
            .and_then(|settlement| settlement.reference.clone())
            .unwrap_or(reference);
        match chain::rpc::observe_settlement(
            &state.client,
            &state.config,
            reference.clone(),
            escrow_account.clone(),
        )
        .await
        {
            Ok(observation) => {
                // Triton observation turns a local reference into a chain-stamped
                // proof panel entry.
                if let Some(settlement) = run.settlement.as_mut() {
                    settlement.triton_observed = Some(
                        observation.signature.is_some() || settlement.payment_signature.is_some(),
                    );
                    settlement.triton_slot = observation.slot;
                    settlement.explorer_url = observation.slot.map(|slot| {
                        format!("https://explorer.solana.com/block/{slot}?cluster=devnet")
                    });
                }
                coral::market::append_timeline(&mut run, "TRITON", observation.note);
                if let Some(yellowstone) = &state.yellowstone {
                    yellowstone.watch_reference(reference);
                    if let Some(account) = escrow_account {
                        yellowstone.watch_account(account);
                    }
                }
            }
            Err(err) => {
                // Keep the run even when RPC is unreachable; the ledger should
                // reflect the attempted observation.
                coral::market::append_timeline(
                    &mut run,
                    "TRITON",
                    format!("chain observer unavailable: {err}"),
                );
            }
        }
    }

    {
        // Persist after settlement/observation enrichment so restart history
        // contains the best available audit trail.
        let ledger = state
            .ledger
            .lock()
            .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
        ledger.upsert_run(&run)?;
    }

    for item in &run.timeline {
        // Replay the complete timeline as live events. Newer UI can animate
        // phases, while current UI receives the final run response.
        let _ = app.emit(
            event_bus::MARKET_ROUND,
            MarketRoundEvent {
                run_id: run.run_id.clone(),
                phase: item.label.clone(),
                detail: item.detail.clone(),
                at: item.at.clone(),
            },
        );
    }

    let _ = app.emit(
        // Notification event is app-internal for now; native notification UI can
        // subscribe to the same semantic payload later.
        event_bus::APP_NOTIFICATION,
        serde_json::json!({
            "title": "Agent round complete",
            "body": format!("{} produced {}", run.run_id, run.track),
            "ts": now_iso()
        }),
    );

    Ok(run)
}

#[tauri::command]
pub fn list_runs(state: State<'_, DesktopState>) -> Result<Vec<AgentRun>, AppError> {
    // History is loaded from SQLite rather than webview memory.
    let ledger = state
        .ledger
        .lock()
        .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
    ledger.list_runs()
}

#[tauri::command]
pub fn get_run(run_id: String, state: State<'_, DesktopState>) -> Result<AgentRun, AppError> {
    let ledger = state
        .ledger
        .lock()
        .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
    ledger.get_run(&run_id)
}

#[tauri::command]
pub fn list_coral_agents() -> Vec<coral::agents::CoralAgentManifest> {
    // Current registry is built-in Rust metadata mirrored by the archived
    // manifests under docs/legacy-coral-agents/.
    coral::agents::built_in_agents()
}

/// Deterministic settlement gate: only verifier-passed runs may create payment
/// intents or reach the settlement bridge. This check is code-only by design.
pub(crate) fn verifier_passed(run: &AgentRun) -> bool {
    run.verdict
        .as_ref()
        .map(|verdict| matches!(verdict.status, VerdictStatus::Pass))
        .unwrap_or(false)
}

/// Merge an incoming settlement receipt into the run, keeping any established
/// payment-rail fields that the newer receipt does not override.
pub(crate) fn merge_receipt(run: &mut AgentRun, mut incoming: SettlementReceipt) {
    if let Some(existing) = run.settlement.take() {
        let keep_primary_payment_rail =
            existing.payment_url.is_some() && incoming.payment_url.is_none();
        if keep_primary_payment_rail || incoming.rail.is_none() {
            incoming.rail = existing.rail;
        }
        if incoming.reference.is_none() {
            incoming.reference = existing.reference;
        }
        if incoming.escrow_pda.is_none() {
            incoming.escrow_pda = existing.escrow_pda;
        }
        if incoming.deposit_tx.is_none() {
            incoming.deposit_tx = existing.deposit_tx;
        }
        if incoming.release_tx.is_none() {
            incoming.release_tx = existing.release_tx;
        }
        if incoming.explorer_url.is_none() {
            incoming.explorer_url = existing.explorer_url;
        }
        if incoming.triton_observed.is_none() {
            incoming.triton_observed = existing.triton_observed;
        }
        if incoming.triton_slot.is_none() {
            incoming.triton_slot = existing.triton_slot;
        }
        if incoming.payment_url.is_none() {
            incoming.payment_url = existing.payment_url;
        }
        if incoming.payment_reference.is_none() {
            incoming.payment_reference = existing.payment_reference;
        }
        if incoming.payment_memo.is_none() {
            incoming.payment_memo = existing.payment_memo;
        }
        if incoming.payment_signature.is_none() {
            incoming.payment_signature = existing.payment_signature;
        }
        if incoming.payment_status.is_none() {
            incoming.payment_status = existing.payment_status;
        }
        if incoming.payment_recipient.is_none() {
            incoming.payment_recipient = existing.payment_recipient;
        }
        if incoming.payment_amount_sol.is_none() {
            incoming.payment_amount_sol = existing.payment_amount_sol;
        }
    }
    run.settlement = Some(incoming);
}
