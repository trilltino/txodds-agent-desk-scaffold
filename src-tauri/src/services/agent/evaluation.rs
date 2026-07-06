//! Lightweight self-evaluation scaffolding for agent decisions.

use serde::{Deserialize, Serialize};

use crate::domain::agent::{AgentAction, AgentDecision};
use crate::types::{TxLineEvent, TxLineEventKind, ValidationSimulationStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvaluation {
    pub run_id: String,
    pub decision_id: String,
    pub outcome: String,
    pub score: f64,
    pub reason: String,
}

pub fn evaluate_decision(
    run_id: &str,
    decision: &AgentDecision,
    later_events: &[TxLineEvent],
) -> Option<AgentEvaluation> {
    let proof_passed_later = later_events.iter().any(|event| {
        event
            .proof
            .as_ref()
            .map(|proof| matches!(proof.simulation_status, ValidationSimulationStatus::Passed))
            .unwrap_or(false)
    });
    let final_seen = later_events
        .iter()
        .any(|event| matches!(event.kind, TxLineEventKind::FinalWhistle));

    match &decision.action {
        AgentAction::TriggerResolution if proof_passed_later && final_seen => {
            Some(AgentEvaluation {
                run_id: run_id.to_string(),
                decision_id: decision.id.clone(),
                outcome: "correct".to_string(),
                score: 1.0,
                reason: "resolution signal matched later final event and proof pass".to_string(),
            })
        }
        AgentAction::FetchProof if proof_passed_later => Some(AgentEvaluation {
            run_id: run_id.to_string(),
            decision_id: decision.id.clone(),
            outcome: "useful".to_string(),
            score: 0.8,
            reason: "proof fetch led to later txoracle pass".to_string(),
        }),
        _ => None,
    }
}
