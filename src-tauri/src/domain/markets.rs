//! Web3 track contract: fixture-bound verified prediction markets.
//!
//! Markets resolve exclusively through the deterministic proof gate - rules
//! are machine-readable predicates over TxLINE validation data, never LLM
//! output (docs/adr/0006-lean-agent-runtime-no-agent-theatre.md).

#![allow(dead_code)] // Staged contract: consumed by the market engine in PR 4.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MarketStatus {
    Draft,
    Open,
    Locked,
    Resolving,
    Resolved,
    Voided,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EscrowMode {
    None,
    Simulated,
    Devnet,
}

/// Machine-readable settlement rule; `predicate` is evaluated by the proof
/// gate against fetched TxLINE stat-validation payloads.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettlementRule {
    pub predicate: String,
    pub stat_key: Option<u32>,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketOutcome {
    pub id: String,
    pub label: String,
    pub won: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PredictionMarket {
    pub id: String,
    pub fixture_id: u64,
    pub title: String,
    pub rule: SettlementRule,
    pub outcomes: Vec<MarketOutcome>,
    pub status: MarketStatus,
    pub escrow_mode: EscrowMode,
    pub escrow_pda: Option<String>,
    pub receipt_id: Option<String>,
}
