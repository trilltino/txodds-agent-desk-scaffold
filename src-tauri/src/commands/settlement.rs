//! Settlement commands: Solana Pay intent lifecycle.
//!
//! Rust creates, persists, and verifies transfer requests; the webview only
//! renders QR-safe payloads. Intent creation is gated on a verifier pass - the
//! deterministic settlement rule that LLMs can never override.

use tauri::{AppHandle, Emitter, State};

use super::intelligence::{merge_receipt, verifier_passed};
use crate::error::AppError;
use crate::event_bus;
use crate::services::coral;
use crate::services::solana_pay::{self, SolanaPayIntent};
use crate::state::DesktopState;

#[tauri::command]
pub fn create_solana_pay_intent(
    run_id: String,
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<SolanaPayIntent, AppError> {
    let mut run = {
        let ledger = state
            .ledger
            .lock()
            .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
        ledger.get_run(&run_id)?
    };

    if !verifier_passed(&run) {
        return Err(AppError::InvalidInput(
            "verifier must pass before Solana Pay intent creation".to_string(),
        ));
    }

    let intent = solana_pay::create_intent(&state.config, &run)?;
    let receipt = solana_pay::receipt_from_intent(&intent);
    merge_receipt(&mut run, receipt);
    coral::market::append_timeline(
        &mut run,
        "SOLANA_PAY",
        format!("created devnet transfer request {}", intent.reference),
    );

    {
        let ledger = state
            .ledger
            .lock()
            .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
        ledger.upsert_payment_intent(&intent)?;
        ledger.upsert_run(&run)?;
    }

    let _ = app.emit(event_bus::PAY_INTENT, &intent);
    if let Some(settlement) = run.settlement.as_ref() {
        let _ = app.emit(event_bus::SETTLE_RECEIPT, settlement);
    }
    Ok(intent)
}

#[tauri::command]
pub async fn verify_solana_pay_intent(
    reference: String,
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<SolanaPayIntent, AppError> {
    let intent = {
        let ledger = state
            .ledger
            .lock()
            .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
        ledger.get_payment_intent_by_reference(&reference)?
    };
    let updated = solana_pay::verify_intent(&state.client, &state.config, intent).await?;

    {
        let ledger = state
            .ledger
            .lock()
            .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
        ledger.upsert_payment_intent(&updated)?;
        if let Ok(mut run) = ledger.get_run(&updated.run_id) {
            merge_receipt(&mut run, solana_pay::receipt_from_intent(&updated));
            coral::market::append_timeline(
                &mut run,
                "SOLANA_PAY",
                format!("{} reference {}", updated.status_text(), updated.reference),
            );
            ledger.upsert_run(&run)?;
            if let Some(settlement) = run.settlement.as_ref() {
                let _ = app.emit(event_bus::SETTLE_RECEIPT, settlement);
            }
        }
    }

    let _ = app.emit(event_bus::PAY_STATUS, &updated);
    Ok(updated)
}

#[tauri::command]
pub fn list_payment_intents(
    run_id: Option<String>,
    state: State<'_, DesktopState>,
) -> Result<Vec<SolanaPayIntent>, AppError> {
    let ledger = state
        .ledger
        .lock()
        .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
    ledger.list_payment_intents(run_id.as_deref())
}
