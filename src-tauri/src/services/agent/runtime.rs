//! Real Match Intelligence Agent runtime.
//!
//! A live TxLINE event now drives the run directly. The legacy
//! `services::coral::market::run_round` simulator is no longer the brain behind
//! `run_agent_round`.

use std::collections::BTreeMap;

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use crate::domain::agent::{AgentDecision, AgentSignal, SignalSeverity, SignalType};
use crate::error::AppError;
use crate::event_bus;
use crate::services::coralos::protocol::{
    message, MATCH_INTELLIGENCE_AGENT, PROOF_GUARD_AGENT, USER_PROXY,
};
use crate::services::{coralos, llm, proof};
use crate::state::DesktopState;
use crate::types::{
    now_iso, AgentBid, AgentDelivery, AgentRole, AgentRun, AgentTraceEvent, AgentTracePhase,
    CoralMessage, CoralSession, CoralVerb, MarketRoundEvent, SettlementReceipt, SettlementStatus,
    TimelineEntry, TrackMode, TxLineEvent, TxLineEventKind, TxLineProofReceipt, VerdictCheck,
    VerdictStatus, VerificationVerdict,
};

use super::{context, evaluation, features, policy, tools};

pub async fn run_match_intelligence_round(
    app: AppHandle,
    state: &DesktopState,
    trigger: TxLineEvent,
    track: TrackMode,
) -> Result<AgentRun, AppError> {
    let recent_runs = {
        let ledger = state
            .ledger
            .lock()
            .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
        ledger.list_runs().unwrap_or_default()
    };
    let mut context = context::build_context(&state.config, track, trigger, None, recent_runs);
    let session =
        coralos::protocol::start_session(&context.run_id, context.event.fixture_id, context.track);
    let mut run = empty_run(&context);
    let mut messages = Vec::new();
    let mut trace = Vec::new();
    let mut round = 1_u64;

    let _ = app.emit(event_bus::CORAL_SESSION, &session);
    emit_message(
        &app,
        &session,
        &mut messages,
        round,
        "txline-ingest",
        vec![MATCH_INTELLIGENCE_AGENT],
        CoralVerb::Observed,
        format!(
            "observed {:?} for fixture {}",
            context.event.kind, context.event.fixture_id
        ),
        Some(json!({
            "eventId": &context.event.id,
            "fixtureId": context.event.fixture_id,
            "kind": &context.event.kind,
            "seq": context.event.seq
        })),
    );
    emit_trace(
        &app,
        &mut trace,
        &run.run_id,
        round,
        AgentTracePhase::Observe,
        "live TxLINE event observed",
        Some(json!({ "eventId": &context.event.id, "fixtureId": context.event.fixture_id })),
    );
    append_timeline(&mut run, "OBSERVE", "live TxLINE event observed");

    round += 1;
    emit_message(
        &app,
        &session,
        &mut messages,
        round,
        "txline-normalizer",
        vec![MATCH_INTELLIGENCE_AGENT],
        CoralVerb::Normalized,
        format!(
            "normalized fixture {} seq {} with {} stat keys",
            context.event.fixture_id,
            context
                .event
                .seq
                .map(|seq| seq.to_string())
                .unwrap_or_else(|| "n/a".to_string()),
            context.event.stat_keys.len()
        ),
        Some(json!({
            "fixtureId": context.event.fixture_id,
            "seq": context.event.seq,
            "statKeys": &context.event.stat_keys,
            "schemaFamily": &context.event.schema_family
        })),
    );

    let mut derived = features::derive_features(&context.event);
    emit_trace(
        &app,
        &mut trace,
        &run.run_id,
        round,
        AgentTracePhase::Derive,
        "market features derived",
        Some(json!({ "features": derived })),
    );
    append_timeline(&mut run, "FEATURES", "market features derived");

    round += 1;
    emit_message(
        &app,
        &session,
        &mut messages,
        round,
        USER_PROXY,
        vec![MATCH_INTELLIGENCE_AGENT],
        CoralVerb::Want,
        format!(
            "WANT txodds.match-intelligence fixture:{} track:{}",
            context.event.fixture_id, context.track
        ),
        Some(json!({ "runId": &run.run_id, "track": context.track })),
    );

    round += 1;
    emit_message(
        &app,
        &session,
        &mut messages,
        round,
        MATCH_INTELLIGENCE_AGENT,
        vec!["feature-extractor"],
        CoralVerb::ToolCall,
        "derive deterministic market features",
        Some(json!({ "tool": "feature_extractor", "fixtureId": context.event.fixture_id })),
    );
    emit_message(
        &app,
        &session,
        &mut messages,
        round,
        "feature-extractor",
        vec![MATCH_INTELLIGENCE_AGENT],
        CoralVerb::ToolResult,
        feature_summary(&derived),
        Some(json!({ "features": &derived })),
    );
    emit_trace(
        &app,
        &mut trace,
        &run.run_id,
        round,
        AgentTracePhase::ToolResult,
        feature_summary(&derived),
        Some(json!({ "features": &derived })),
    );

    round += 1;
    emit_message(
        &app,
        &session,
        &mut messages,
        round,
        MATCH_INTELLIGENCE_AGENT,
        vec![PROOF_GUARD_AGENT],
        CoralVerb::ProofRequested,
        format!(
            "request TxLINE txoracle proof for fixture {} seq {}",
            context.event.fixture_id,
            context
                .event
                .seq
                .map(|seq| seq.to_string())
                .unwrap_or_else(|| "latest".to_string())
        ),
        Some(json!({
            "fixtureId": context.event.fixture_id,
            "seq": context.event.seq,
            "statKeys": &context.event.stat_keys
        })),
    );
    emit_trace(
        &app,
        &mut trace,
        &run.run_id,
        round,
        AgentTracePhase::ToolCall,
        "txoracle proof requested",
        Some(json!({ "tool": "txoracle_validation" })),
    );
    let (proof_receipt, proof_gate) =
        tools::request_proof(&state.validation_bridge, &state.client, &state.config, &run).await;
    context.proof = Some(proof_receipt.clone());
    context.event.proof = Some(proof_receipt.clone());
    run.trigger.proof = Some(proof_receipt.clone());
    derived = features::derive_features(&context.event);
    append_timeline(
        &mut run,
        "PROOF_GATE",
        format!(
            "{}: {}",
            if proof_gate.pass {
                "pass"
            } else {
                "needs_review"
            },
            proof_gate.reason
        ),
    );
    emit_message(
        &app,
        &session,
        &mut messages,
        round,
        PROOF_GUARD_AGENT,
        vec![MATCH_INTELLIGENCE_AGENT],
        CoralVerb::ProofReceived,
        proof_receipt.note.clone(),
        Some(json!({ "receipt": &proof_receipt, "gate": &proof_gate })),
    );
    emit_message(
        &app,
        &session,
        &mut messages,
        round,
        PROOF_GUARD_AGENT,
        vec![MATCH_INTELLIGENCE_AGENT],
        CoralVerb::ValidationSimulated,
        format!("txoracle simulation {:?}", proof_receipt.simulation_status),
        Some(json!({
            "status": &proof_receipt.simulation_status,
            "verified": proof_receipt.verified,
            "gatePass": proof_gate.pass
        })),
    );
    emit_trace(
        &app,
        &mut trace,
        &run.run_id,
        round,
        AgentTracePhase::Proof,
        proof_receipt.note.clone(),
        Some(json!({ "receipt": &proof_receipt, "gate": &proof_gate })),
    );
    let _ = app.emit(event_bus::WEB3_PROOF_RECEIPT, &proof_receipt);
    let _ = app.emit(
        event_bus::VALIDATION_STATUS,
        json!({
            "runId": &run.run_id,
            "status": &proof_receipt.simulation_status,
            "verified": proof_receipt.verified,
            "note": &proof_receipt.note
        }),
    );
    let _ = app.emit(event_bus::TXLINE_EVENT, proof_event(&run, &proof_receipt));

    let llm_response = explain_decision(&state.client, &state.config, &context, &derived).await;
    round += 1;
    emit_message(
        &app,
        &session,
        &mut messages,
        round,
        MATCH_INTELLIGENCE_AGENT,
        vec![USER_PROXY],
        CoralVerb::AgentThought,
        llm_response.text.clone(),
        Some(json!({
            "llm": {
                "provider": &llm_response.provider,
                "model": &llm_response.model,
                "used": llm_response.used,
                "reason": &llm_response.reason,
                "traceEnabled": state.config.llm_trace
            },
            "affectedFunds": false
        })),
    );
    emit_trace(
        &app,
        &mut trace,
        &run.run_id,
        round,
        AgentTracePhase::LlmReasoning,
        if llm_response.used {
            "Venice explanation generated"
        } else {
            "deterministic explanation used"
        },
        Some(json!({ "llm": &llm_response })),
    );

    let maybe_signal = build_signal(&context, &derived);
    let mut maybe_decision = None;
    if let Some(signal) = maybe_signal {
        {
            let ledger = state
                .ledger
                .lock()
                .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
            let _ = ledger.insert_agent_signal(&run.run_id, &signal);
        }
        round += 1;
        emit_message(
            &app,
            &session,
            &mut messages,
            round,
            MATCH_INTELLIGENCE_AGENT,
            vec![USER_PROXY],
            CoralVerb::Signal,
            signal_summary(&signal),
            Some(json!({ "signal": &signal })),
        );
        let _ = app.emit(
            event_bus::AGENT_SIGNAL,
            messages.last().expect("signal message emitted"),
        );

        let decision = policy::choose_action(
            &context,
            &signal,
            &derived,
            Some(&proof_gate),
            llm_response.text.clone(),
        );
        apply_decision_to_run(
            &mut run,
            &context,
            &derived,
            &proof_receipt,
            &proof_gate,
            &signal,
            &decision,
        );
        append_timeline(
            &mut run,
            "DECISION",
            format!("{:?} -> {:?}", signal.signal_type, decision.action),
        );
        emit_trace(
            &app,
            &mut trace,
            &run.run_id,
            round,
            AgentTracePhase::Decision,
            decision.explanation.clone(),
            Some(json!({
                "signal": &signal,
                "decision": &decision,
                "proofGate": &proof_gate
            })),
        );
        emit_trace(
            &app,
            &mut trace,
            &run.run_id,
            round,
            AgentTracePhase::Action,
            action_summary(&decision),
            Some(json!({ "decision": &decision })),
        );
        emit_message(
            &app,
            &session,
            &mut messages,
            round,
            MATCH_INTELLIGENCE_AGENT,
            vec![USER_PROXY],
            CoralVerb::ToolResult,
            action_summary(&decision),
            Some(json!({ "decision": &decision })),
        );
        maybe_decision = Some(decision);
    } else {
        run.verdict = Some(VerificationVerdict {
            status: VerdictStatus::NeedsReview,
            reason: "event stayed below autonomous signal threshold".to_string(),
            checked: vec![VerdictCheck::TxlineInput, VerdictCheck::Policy],
        });
        append_timeline(&mut run, "DECISION", "no actionable signal emitted");
    }

    let queued_evaluation = maybe_decision
        .as_ref()
        .and_then(|decision| evaluation::evaluate_decision(&run.run_id, decision, &[]));
    round += 1;
    emit_message(
        &app,
        &session,
        &mut messages,
        round,
        MATCH_INTELLIGENCE_AGENT,
        vec![USER_PROXY],
        CoralVerb::Evaluated,
        "evaluation queued until later live TxLINE updates arrive",
        Some(json!({
            "status": "queued",
            "windowSecs": 900,
            "currentEvaluation": queued_evaluation
        })),
    );
    let _ = app.emit(
        event_bus::AGENT_EVALUATION,
        messages.last().expect("evaluation message emitted"),
    );
    emit_trace(
        &app,
        &mut trace,
        &run.run_id,
        round,
        AgentTracePhase::Evaluation,
        "evaluation queued",
        Some(json!({
            "status": "queued",
            "windowSecs": 900,
            "currentEvaluation": queued_evaluation
        })),
    );

    let console =
        coralos::console::publish_run(&state.client, &state.config, &run, &messages).await;
    append_timeline(&mut run, "CORALOS_CONSOLE", console.note.clone());
    emit_trace(
        &app,
        &mut trace,
        &run.run_id,
        round + 1,
        AgentTracePhase::ToolResult,
        console.note.clone(),
        Some(json!({ "coralConsole": console })),
    );

    persist_run(
        state,
        &run,
        &context.event,
        &proof_receipt,
        maybe_decision.as_ref(),
        &llm_response,
    )?;
    let _ = coralos::transcript::persist_run_artifacts(
        &state.replay_dir,
        &run.run_id,
        &messages,
        &trace,
        Some(&proof_receipt),
    );
    for item in &run.timeline {
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
        event_bus::APP_NOTIFICATION,
        json!({
            "title": "Match Intelligence Agent complete",
            "body": format!("{} produced {}", run.run_id, run.track),
            "ts": now_iso()
        }),
    );
    Ok(run)
}

pub fn build_signal(
    context: &context::AgentContext,
    derived: &features::MarketFeatures,
) -> Option<AgentSignal> {
    if derived.severity_score < 0.55 {
        return None;
    }

    let signal_type = match &context.event.kind {
        TxLineEventKind::OddsMove | TxLineEventKind::OddsUpdate => SignalType::SharpOddsMove,
        TxLineEventKind::Goal | TxLineEventKind::ScoreUpdate => SignalType::ScoreEvent,
        TxLineEventKind::RedCard => SignalType::RedCardReprice,
        TxLineEventKind::FinalWhistle | TxLineEventKind::ProofReceived => SignalType::ProofReady,
        _ => return None,
    };

    let severity = if derived.severity_score >= 0.85 {
        SignalSeverity::Critical
    } else if derived.severity_score >= 0.70 {
        SignalSeverity::High
    } else if derived.severity_score >= 0.55 {
        SignalSeverity::Medium
    } else {
        SignalSeverity::Low
    };

    let mut measured = BTreeMap::new();
    measured.insert("severityScore".to_string(), json!(derived.severity_score));
    measured.insert(
        "actionabilityScore".to_string(),
        json!(derived.actionability_score),
    );
    measured.insert("proofPresent".to_string(), json!(derived.proof_present));
    measured.insert("rootPresent".to_string(), json!(derived.root_present));
    measured.insert("txoraclePassed".to_string(), json!(derived.txoracle_passed));
    if let Some(probability) = derived.best_implied_probability {
        measured.insert("bestImpliedProbability".to_string(), json!(probability));
    }

    Some(AgentSignal {
        id: format!("signal-{}", uuid::Uuid::new_v4()),
        fixture_id: context.event.fixture_id,
        source_event_id: context.event.id.clone(),
        signal_type,
        severity,
        confidence: derived.severity_score.max(derived.actionability_score),
        features: measured,
        rationale: derived.reasons.join("; "),
        created_at: now_iso(),
    })
}

async fn explain_decision(
    client: &reqwest::Client,
    config: &crate::config::AppConfig,
    context: &context::AgentContext,
    derived: &features::MarketFeatures,
) -> llm::LlmResponse {
    let request = llm::LlmRequest {
        system: [
            "You explain a Rust sports-data agent decision.",
            "Use only the supplied facts.",
            "Do not claim proof passed unless txoraclePassed is true.",
            "Do not recommend signing, payment release, or settlement.",
            "Return two concise sentences.",
        ]
        .join(" "),
        user: json!({
            "fixtureId": context.event.fixture_id,
            "track": context.track,
            "eventKind": format!("{:?}", context.event.kind),
            "title": &context.event.title,
            "features": derived
        })
        .to_string(),
        model: config.llm_model.clone(),
        max_tokens: 300,
        temperature: 0.2,
    };

    match llm::VeniceClient::new(client.clone())
        .complete(config, request)
        .await
    {
        Ok(response) => response,
        Err(err) => llm::LlmResponse::fallback(
            format!(
                "Deterministic explanation used: {}",
                feature_summary(derived)
            ),
            format!("llm_error:{err}"),
        ),
    }
}

fn empty_run(context: &context::AgentContext) -> AgentRun {
    AgentRun {
        run_id: context.run_id.clone(),
        track: context.track,
        trigger: context.event.clone(),
        bids: Vec::new(),
        winner: None,
        delivery: None,
        verdict: None,
        settlement: Some(SettlementReceipt {
            rail: None,
            status: SettlementStatus::NotStarted,
            reference: None,
            escrow_pda: None,
            deposit_tx: None,
            release_tx: None,
            explorer_url: None,
            triton_observed: Some(false),
            triton_slot: None,
            payment_url: None,
            payment_reference: None,
            payment_memo: None,
            payment_signature: None,
            payment_status: None,
            payment_recipient: None,
            payment_amount_sol: None,
        }),
        timeline: vec![TimelineEntry {
            at: now_iso(),
            label: "TRIGGER".to_string(),
            detail: format!("{:?}: {}", &context.event.kind, &context.event.title),
        }],
    }
}

fn apply_decision_to_run(
    run: &mut AgentRun,
    context: &context::AgentContext,
    derived: &features::MarketFeatures,
    proof_receipt: &TxLineProofReceipt,
    proof_gate: &proof::ProofGateDecision,
    signal: &AgentSignal,
    decision: &AgentDecision,
) {
    let bid = AgentBid {
        agent_id: MATCH_INTELLIGENCE_AGENT.to_string(),
        role: role_for_track(context.track),
        price_sol: 0.0,
        confidence: decision.confidence,
        eta_ms: 0,
        note: format!(
            "Real Rust Coral agent: {:?} with {:?}; no seller auction or fake verifier.",
            signal.signal_type, decision.action
        ),
    };
    run.bids = vec![bid.clone()];
    run.winner = Some(bid);

    let payload = json!({
        "type": "match_intelligence_decision",
        "runId": &run.run_id,
        "fixtureId": context.event.fixture_id,
        "track": context.track,
        "signal": signal,
        "decision": decision,
        "features": derived,
        "proofGate": proof_gate,
        "proof": proof_receipt,
        "fundsMoved": false
    })
    .to_string();
    let sha256 = sha256_hex(&payload);
    run.delivery = Some(AgentDelivery {
        agent_id: MATCH_INTELLIGENCE_AGENT.to_string(),
        title: "Match Intelligence decision package".to_string(),
        payload,
        sha256: sha256.clone(),
        citations: vec![
            "Live TxLINE SSE event".to_string(),
            "Read-only txoracle validation bridge".to_string(),
        ],
        strategy: matches!(context.track, TrackMode::Trading)
            .then(|| "simulate only; no position is executed".to_string()),
        risk: Some("LLM cannot pass proof, release funds, or sign transactions".to_string()),
        fan_copy: matches!(context.track, TrackMode::Fan).then(|| decision.explanation.clone()),
    });

    let gate_verdict = proof::verdict_from_gate(proof_gate);
    run.verdict = Some(
        if proof_gate.pass && matches!(context.track, TrackMode::Settlement) {
            gate_verdict
        } else {
            VerificationVerdict {
                status: VerdictStatus::NeedsReview,
                reason: if matches!(context.track, TrackMode::Settlement) {
                    proof_gate.reason.clone()
                } else {
                    "non-settlement decision recorded; settlement remains proof-gated".to_string()
                },
                checked: vec![
                    VerdictCheck::TxlineInput,
                    VerdictCheck::Proof,
                    VerdictCheck::Policy,
                ],
            }
        },
    );

    if let Some(settlement) = run.settlement.as_mut() {
        settlement.reference = Some(format!("sha256:{sha256}"));
        settlement.status = SettlementStatus::NotStarted;
    }
}

fn role_for_track(track: TrackMode) -> AgentRole {
    match track {
        TrackMode::Settlement => AgentRole::Verifier,
        TrackMode::Trading => AgentRole::Sharp,
        TrackMode::Fan => AgentRole::Pundit,
    }
}

fn persist_run(
    state: &DesktopState,
    run: &AgentRun,
    event: &TxLineEvent,
    proof_receipt: &TxLineProofReceipt,
    decision: Option<&AgentDecision>,
    llm_response: &llm::LlmResponse,
) -> Result<(), AppError> {
    let ledger = state
        .ledger
        .lock()
        .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
    ledger.upsert_run(run)?;
    ledger.insert_agent_observation(&run.run_id, event)?;
    ledger.insert_proof_receipt(&run.run_id, proof_receipt)?;
    ledger.insert_llm_call(&run.run_id, llm_response)?;
    if let Some(decision) = decision {
        ledger.insert_agent_decision(&run.run_id, decision)?;
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn emit_message(
    app: &AppHandle,
    session: &CoralSession,
    messages: &mut Vec<CoralMessage>,
    round: u64,
    from: impl Into<String>,
    to: Vec<&str>,
    verb: CoralVerb,
    text: impl Into<String>,
    payload: Option<Value>,
) {
    let message = message(session, round, from, to, verb, text, payload);
    let _ = app.emit(event_bus::CORAL_MESSAGE, &message);
    messages.push(message);
}

fn emit_trace(
    app: &AppHandle,
    trace: &mut Vec<AgentTraceEvent>,
    run_id: &str,
    round: u64,
    phase: AgentTracePhase,
    summary: impl Into<String>,
    payload: Option<Value>,
) {
    let event = AgentTraceEvent {
        id: format!("trace-{}", uuid::Uuid::new_v4()),
        run_id: run_id.to_string(),
        round,
        phase,
        summary: summary.into(),
        payload,
        ts: now_iso(),
    };
    let _ = app.emit(event_bus::AGENT_TRACE, &event);
    trace.push(event);
}

fn append_timeline(run: &mut AgentRun, label: impl Into<String>, detail: impl Into<String>) {
    run.timeline.push(TimelineEntry {
        at: now_iso(),
        label: label.into(),
        detail: detail.into(),
    });
}

fn feature_summary(derived: &features::MarketFeatures) -> String {
    format!(
        "severity={:.2} actionability={:.2} proof={} root={} txoracle={}",
        derived.severity_score,
        derived.actionability_score,
        derived.proof_present,
        derived.root_present,
        derived.txoracle_passed
    )
}

fn signal_summary(signal: &AgentSignal) -> String {
    format!(
        "{:?} for fixture {} confidence {:.2}",
        signal.signal_type, signal.fixture_id, signal.confidence
    )
}

fn action_summary(decision: &AgentDecision) -> String {
    format!(
        "action {:?} status {:?}",
        decision.action, decision.execution_status
    )
}

fn sha256_hex(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}

fn proof_event(run: &AgentRun, proof: &TxLineProofReceipt) -> TxLineEvent {
    TxLineEvent {
        id: format!("proof-{}-{}", run.run_id, uuid::Uuid::new_v4()),
        kind: TxLineEventKind::ProofReceived,
        fixture_id: proof.fixture_id,
        seq: proof.seq,
        txline_ts: proof.txline_ts.clone(),
        action: Some("ProofReceived".to_string()),
        confirmed: Some(proof.verified),
        participant: None,
        period: None,
        stat_keys: proof.stat_keys.clone(),
        schema_family: Some("proof".to_string()),
        title: if proof.verified {
            "TxLINE proof verified".to_string()
        } else {
            "TxLINE proof pending".to_string()
        },
        body: proof.note.clone(),
        ts: now_iso(),
        raw: proof.raw.clone(),
        odds: None,
        score: None,
        proof: Some(proof.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{now_iso, TxLineEventKind};

    #[test]
    fn low_severity_fixture_does_not_emit_signal() {
        let event = test_event(TxLineEventKind::Fixture);
        let context = context::AgentContext {
            run_id: "run".to_string(),
            track: TrackMode::Fan,
            event,
            proof: None,
            thresholds: context::AgentThresholds {
                odds_move_trigger_pct: 5.0,
                max_devnet_spend_sol: 0.05,
            },
            recent_runs: vec![],
        };
        let derived = features::derive_features(&context.event);
        assert!(build_signal(&context, &derived).is_none());
    }

    fn test_event(kind: TxLineEventKind) -> TxLineEvent {
        TxLineEvent {
            id: "event".to_string(),
            kind,
            fixture_id: 1,
            seq: Some(10),
            txline_ts: Some(now_iso()),
            action: None,
            confirmed: None,
            participant: None,
            period: None,
            stat_keys: vec!["1002".to_string()],
            schema_family: Some("scores".to_string()),
            title: "event".to_string(),
            body: "body".to_string(),
            ts: now_iso(),
            raw: None,
            odds: None,
            score: None,
            proof: None,
        }
    }
}
