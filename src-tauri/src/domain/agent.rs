//! Agent track contract: Match Intelligence Agent signals and decisions.
//!
//! One autonomous runtime observes normalized TxLINE events, detects signals
//! with deterministic formulas, gates actions through policy, executes, and
//! later evaluates its own calls. LLMs may explain a decision that code has
//! already made; they never make one.

#![allow(dead_code)] // Staged contract: consumed by the intelligence runtime in PR 5.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SignalType {
    SharpOddsMove,
    ScoreEvent,
    RedCardReprice,
    LateMarketShift,
    ProofReady,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SignalSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSignal {
    pub id: String,
    pub fixture_id: u64,
    pub source_event_id: String,
    #[serde(rename = "type")]
    pub signal_type: SignalType,
    pub severity: SignalSeverity,
    pub confidence: f64,
    /// The measured inputs behind the signal (e.g. implied-probability move in
    /// points) so every emission is reproducible from features alone.
    pub features: BTreeMap<String, serde_json::Value>,
    pub rationale: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentAction {
    Ignore,
    Watch,
    Notify,
    SimulatePosition,
    FetchProof,
    TriggerResolution,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStatus {
    Pending,
    Executed,
    Blocked,
    Failed,
}

/// One named policy gate with its outcome, kept per-decision so the UI can
/// show exactly why an action was allowed or blocked.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyCheck {
    pub name: String,
    pub passed: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDecision {
    pub id: String,
    pub signal_id: String,
    pub action: AgentAction,
    pub confidence: f64,
    pub policy_checks: Vec<PolicyCheck>,
    pub explanation: String,
    pub execution_status: ExecutionStatus,
    pub created_at: String,
}

/// Rolling self-evaluation metrics surfaced by the AccuracyTracker UI.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMetrics {
    pub signals_emitted: u64,
    pub signals_correct: u64,
    pub signals_incorrect: u64,
    pub signals_expired: u64,
    pub avg_time_to_outcome_secs: Option<f64>,
}
