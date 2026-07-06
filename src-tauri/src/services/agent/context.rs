//! Per-event context for the Match Intelligence Agent.

use serde::{Deserialize, Serialize};

use crate::config::AppConfig;
use crate::types::{AgentRun, TrackMode, TxLineEvent, TxLineProofReceipt};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentContext {
    pub run_id: String,
    pub track: TrackMode,
    pub event: TxLineEvent,
    pub proof: Option<TxLineProofReceipt>,
    pub thresholds: AgentThresholds,
    pub recent_runs: Vec<RunSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentThresholds {
    pub odds_move_trigger_pct: f64,
    pub max_devnet_spend_sol: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSummary {
    pub run_id: String,
    pub fixture_id: u64,
    pub track: TrackMode,
    pub created_at: String,
}

pub fn build_context(
    config: &AppConfig,
    track: TrackMode,
    event: TxLineEvent,
    proof: Option<TxLineProofReceipt>,
    recent_runs: Vec<AgentRun>,
) -> AgentContext {
    AgentContext {
        run_id: format!("{track}-{}-{}", event.id, uuid::Uuid::new_v4()),
        track,
        event,
        proof,
        thresholds: AgentThresholds {
            odds_move_trigger_pct: config.odds_move_trigger_pct,
            max_devnet_spend_sol: config.max_devnet_spend_sol,
        },
        recent_runs: recent_runs
            .into_iter()
            .take(20)
            .map(|run| RunSummary {
                run_id: run.run_id,
                fixture_id: run.trigger.fixture_id,
                track: run.track,
                created_at: run
                    .timeline
                    .first()
                    .map(|entry| entry.at.clone())
                    .unwrap_or_else(crate::types::now_iso),
            })
            .collect(),
    }
}
