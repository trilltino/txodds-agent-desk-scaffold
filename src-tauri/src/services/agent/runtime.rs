//! Deterministic Match Intelligence Agent trace builder.

use serde_json::json;
use uuid::Uuid;

use crate::services::coralos::protocol::{
    message, MATCH_INTELLIGENCE_AGENT, PROOF_GUARD_AGENT, SETTLEMENT_RAIL, USER_PROXY,
};
use crate::types::{
    now_iso, AgentRun, AgentTraceEvent, AgentTracePhase, CoralMessage, CoralSession, CoralVerb,
    TxLineEventKind, TxLineProofReceipt,
};

pub struct AgentArtifacts {
    pub messages: Vec<CoralMessage>,
    pub trace: Vec<AgentTraceEvent>,
}

pub fn build_artifacts(
    session: &CoralSession,
    round: u64,
    run: &AgentRun,
    proof: &TxLineProofReceipt,
) -> AgentArtifacts {
    let mut messages = Vec::new();
    let mut trace = Vec::new();
    let trigger = &run.trigger;
    let importance = signal_importance(run);
    let confidence = run
        .winner
        .as_ref()
        .map(|winner| winner.confidence)
        .unwrap_or(0.72);

    messages.push(message(
        session,
        round,
        "txline-ingest",
        vec![MATCH_INTELLIGENCE_AGENT],
        CoralVerb::Observed,
        format!(
            "observed {:?} for fixture {}",
            trigger.kind, trigger.fixture_id
        ),
        Some(json!({ "event": trigger })),
    ));
    messages.push(message(
        session,
        round,
        "txline-normalizer",
        vec![MATCH_INTELLIGENCE_AGENT],
        CoralVerb::Normalized,
        normalized_summary(run),
        Some(json!({
            "fixtureId": trigger.fixture_id,
            "seq": trigger.seq,
            "statKeys": trigger.stat_keys,
            "schemaFamily": trigger.schema_family
        })),
    ));
    messages.push(message(
        session,
        round,
        USER_PROXY,
        vec![MATCH_INTELLIGENCE_AGENT],
        CoralVerb::Want,
        format!(
            "WANT txodds.match-intelligence fixture:{} track:{}",
            trigger.fixture_id, run.track
        ),
        Some(json!({ "runId": run.run_id, "track": run.track })),
    ));
    messages.push(message(
        session,
        round,
        MATCH_INTELLIGENCE_AGENT,
        vec![],
        CoralVerb::AgentThought,
        agent_thought(run),
        Some(json!({ "importance": importance, "confidence": confidence })),
    ));
    messages.push(message(
        session,
        round,
        MATCH_INTELLIGENCE_AGENT,
        vec!["edge_detector"],
        CoralVerb::ToolCall,
        "edge_detector compares event kind, odds movement, and score context",
        Some(json!({ "tool": "edge_detector", "fixtureId": trigger.fixture_id })),
    ));
    messages.push(message(
        session,
        round,
        "edge_detector",
        vec![MATCH_INTELLIGENCE_AGENT],
        CoralVerb::ToolResult,
        edge_result(run),
        Some(json!({ "tool": "edge_detector", "importance": importance })),
    ));
    messages.push(message(
        session,
        round,
        MATCH_INTELLIGENCE_AGENT,
        vec!["proof_gate"],
        CoralVerb::ProofRequested,
        proof_request_summary(run),
        Some(json!({
            "fixtureId": trigger.fixture_id,
            "seq": trigger.seq,
            "statKeys": trigger.stat_keys
        })),
    ));
    messages.push(message(
        session,
        round,
        PROOF_GUARD_AGENT,
        vec![MATCH_INTELLIGENCE_AGENT],
        CoralVerb::ProofReceived,
        proof.note.clone(),
        Some(json!(proof)),
    ));
    messages.push(message(
        session,
        round,
        PROOF_GUARD_AGENT,
        vec![MATCH_INTELLIGENCE_AGENT],
        CoralVerb::ValidationSimulated,
        format!(
            "validation simulation {}",
            serde_json::to_value(&proof.simulation_status).unwrap_or(json!("not_started"))
        ),
        Some(json!({ "status": proof.simulation_status, "verified": proof.verified })),
    ));
    if let Some(settlement) = run.settlement.as_ref() {
        if settlement.payment_reference.is_some() {
            messages.push(message(
                session,
                round,
                SETTLEMENT_RAIL,
                vec![USER_PROXY],
                CoralVerb::PaymentRequired,
                format!(
                    "Solana Pay reference {}",
                    settlement.payment_reference.as_deref().unwrap_or("-")
                ),
                Some(json!(settlement)),
            ));
        }
    }
    messages.push(message(
        session,
        round,
        PROOF_GUARD_AGENT,
        vec![MATCH_INTELLIGENCE_AGENT],
        CoralVerb::Verified,
        run.verdict
            .as_ref()
            .map(|verdict| verdict.reason.clone())
            .unwrap_or_else(|| "verdict pending".to_string()),
        Some(json!({ "verdict": run.verdict })),
    ));
    messages.push(message(
        session,
        round,
        MATCH_INTELLIGENCE_AGENT,
        vec![USER_PROXY],
        CoralVerb::Signal,
        signal_summary(run),
        Some(json!({
            "kind": signal_kind(run),
            "importance": importance,
            "confidence": confidence,
            "action": agent_action(run)
        })),
    ));
    messages.push(message(
        session,
        round,
        MATCH_INTELLIGENCE_AGENT,
        vec![USER_PROXY],
        CoralVerb::Evaluated,
        "evaluation queued until later TxLINE updates arrive",
        Some(json!({ "status": "queued", "windowSecs": 900 })),
    ));

    trace.push(trace_event(
        run,
        round,
        AgentTracePhase::Observe,
        normalized_summary(run),
        Some(json!({ "eventId": trigger.id })),
    ));
    trace.push(trace_event(
        run,
        round,
        AgentTracePhase::Derive,
        agent_thought(run),
        Some(json!({ "importance": importance })),
    ));
    trace.push(trace_event(
        run,
        round,
        AgentTracePhase::ToolCall,
        "edge_detector",
        Some(json!({ "fixtureId": trigger.fixture_id })),
    ));
    trace.push(trace_event(
        run,
        round,
        AgentTracePhase::ToolResult,
        edge_result(run),
        Some(json!({ "importance": importance })),
    ));
    trace.push(trace_event(
        run,
        round,
        AgentTracePhase::Proof,
        proof.note.clone(),
        Some(json!(proof)),
    ));
    trace.push(trace_event(
        run,
        round,
        AgentTracePhase::Payment,
        payment_summary(run),
        Some(json!({ "settlement": run.settlement })),
    ));
    trace.push(trace_event(
        run,
        round,
        AgentTracePhase::Evaluation,
        "queued evaluation memory",
        Some(json!({ "windowSecs": 900 })),
    ));

    AgentArtifacts { messages, trace }
}

fn trace_event(
    run: &AgentRun,
    round: u64,
    phase: AgentTracePhase,
    summary: impl Into<String>,
    payload: Option<serde_json::Value>,
) -> AgentTraceEvent {
    AgentTraceEvent {
        id: format!("trace-{}", Uuid::new_v4()),
        run_id: run.run_id.clone(),
        round,
        phase,
        summary: summary.into(),
        payload,
        ts: now_iso(),
    }
}

fn normalized_summary(run: &AgentRun) -> String {
    let trigger = &run.trigger;
    format!(
        "normalized fixture {} seq {} with {} stat keys",
        trigger.fixture_id,
        trigger
            .seq
            .map(|seq| seq.to_string())
            .unwrap_or_else(|| "n/a".to_string()),
        trigger.stat_keys.len()
    )
}

fn agent_thought(run: &AgentRun) -> String {
    match run.trigger.kind {
        TxLineEventKind::OddsMove | TxLineEventKind::OddsUpdate => {
            "odds movement is material enough to alert and request proof context".to_string()
        }
        TxLineEventKind::Goal | TxLineEventKind::RedCard | TxLineEventKind::FinalWhistle => {
            "scoreboard event changes match state and fan/market interpretation".to_string()
        }
        _ => "event is useful context but below autonomous action threshold".to_string(),
    }
}

fn edge_result(run: &AgentRun) -> String {
    format!("signal={} action={}", signal_kind(run), agent_action(run))
}

fn proof_request_summary(run: &AgentRun) -> String {
    format!(
        "request TxLINE proof for fixture {} seq {}",
        run.trigger.fixture_id,
        run.trigger
            .seq
            .map(|seq| seq.to_string())
            .unwrap_or_else(|| "latest".to_string())
    )
}

fn signal_summary(run: &AgentRun) -> String {
    format!(
        "{} for fixture {}",
        signal_kind(run),
        run.trigger.fixture_id
    )
}

fn payment_summary(run: &AgentRun) -> String {
    run.settlement
        .as_ref()
        .and_then(|settlement| settlement.payment_status.clone())
        .map(|status| format!("Solana Pay {status}"))
        .unwrap_or_else(|| "payment not required or not configured".to_string())
}

fn signal_kind(run: &AgentRun) -> &'static str {
    match run.trigger.kind {
        TxLineEventKind::OddsMove | TxLineEventKind::OddsUpdate => "sharp_odds_move",
        TxLineEventKind::Goal | TxLineEventKind::ScoreUpdate => "score_event",
        TxLineEventKind::RedCard => "red_card_reprice",
        TxLineEventKind::FinalWhistle => "settlement_ready",
        TxLineEventKind::ProofReceived => "proof_ready",
        _ => "match_context",
    }
}

fn agent_action(run: &AgentRun) -> &'static str {
    match run.track {
        crate::types::TrackMode::Settlement => "fetch_proof",
        crate::types::TrackMode::Trading => "simulate_position",
        crate::types::TrackMode::Fan => "notify",
    }
}

fn signal_importance(run: &AgentRun) -> f64 {
    match run.trigger.kind {
        TxLineEventKind::OddsMove => 0.88,
        TxLineEventKind::Goal | TxLineEventKind::RedCard => 0.82,
        TxLineEventKind::FinalWhistle | TxLineEventKind::ProofReceived => 0.78,
        _ => 0.58,
    }
}
