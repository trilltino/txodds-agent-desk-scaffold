//! Shared backend data contracts.
//!
//! These structs are serialized through Tauri IPC/events and intentionally
//! mirror the frontend TypeScript contracts in `src/types.ts`.

use serde::{Deserialize, Serialize};
use serde_json::Value;

// Solana clusters supported by the desktop command surface.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Cluster {
    Devnet,
    Mainnet,
}

// Product track selected in the UI and recorded on every run.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrackMode {
    Settlement,
    Trading,
    Fan,
}

impl std::fmt::Display for TrackMode {
    // Store track values in lowercase strings for SQLite rows and user-facing
    // timeline text.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let value = match self {
            Self::Settlement => "settlement",
            Self::Trading => "trading",
            Self::Fan => "fan",
        };
        f.write_str(value)
    }
}

// Normalized TxLINE event kinds consumed by the market engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TxLineEventKind {
    Fixture,
    ScoreUpdate,
    OddsUpdate,
    Goal,
    RedCard,
    FinalWhistle,
    OddsMove,
    ProofReceived,
}

// Odds quote normalized from TxLINE odds payloads.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OddsQuote {
    pub fixture_id: u64,
    pub outcome: String,
    pub decimal: f64,
    pub implied_probability: f64,
    pub source: Option<String>,
    pub ts: String,
}

// Score tuple shown in event/delivery payloads.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Score {
    pub home: i64,
    pub away: i64,
}

// Optional proof receipt attached to a TxLINE event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TxLineProofReceipt {
    pub fixture_id: u64,
    #[serde(default)]
    pub seq: Option<u64>,
    #[serde(default)]
    pub stat_key: Option<u64>,
    #[serde(default)]
    pub stat_keys: Vec<String>,
    #[serde(default)]
    pub txline_ts: Option<String>,
    #[serde(default)]
    pub epoch_day: Option<u32>,
    #[serde(default)]
    pub merkle_root: Option<String>,
    #[serde(default)]
    pub stat_proof_hash: Option<String>,
    #[serde(default)]
    pub root_pda: Option<String>,
    #[serde(default)]
    pub txline_program: Option<String>,
    #[serde(default)]
    pub root_observed_slot: Option<u64>,
    #[serde(default)]
    pub proof_present: bool,
    #[serde(default)]
    pub root_present: bool,
    #[serde(default)]
    pub simulation_status: ValidationSimulationStatus,
    pub verified: bool,
    pub note: String,
    #[serde(default)]
    pub raw: Option<Value>,
}

// Canonical TxLINE event shape across live ingestion and persisted receipts.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TxLineEvent {
    pub id: String,
    pub kind: TxLineEventKind,
    pub fixture_id: u64,
    #[serde(default)]
    pub seq: Option<u64>,
    #[serde(default)]
    pub txline_ts: Option<String>,
    #[serde(default)]
    pub action: Option<String>,
    #[serde(default)]
    pub confirmed: Option<bool>,
    #[serde(default)]
    pub participant: Option<String>,
    #[serde(default)]
    pub period: Option<String>,
    #[serde(default)]
    pub stat_keys: Vec<String>,
    #[serde(default)]
    pub schema_family: Option<String>,
    pub title: String,
    pub body: String,
    pub ts: String,
    pub raw: Option<Value>,
    pub odds: Option<Vec<OddsQuote>>,
    pub score: Option<Score>,
    pub proof: Option<TxLineProofReceipt>,
}

// Coral market role used for scoring and track filtering.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentRole {
    Sharp,
    Risk,
    Pundit,
    Settlement,
    Fan,
    Verifier,
}

// Bid submitted by a seller/verifier/settlement agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentBid {
    pub agent_id: String,
    pub role: AgentRole,
    pub price_sol: f64,
    pub confidence: f64,
    pub eta_ms: u64,
    pub note: String,
}

// Hash-bound artifact produced by the winning agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDelivery {
    pub agent_id: String,
    pub title: String,
    pub payload: String,
    pub sha256: String,
    pub citations: Vec<String>,
    pub strategy: Option<String>,
    pub risk: Option<String>,
    pub fan_copy: Option<String>,
}

// Verifier decision state.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VerdictStatus {
    Pass,
    Fail,
    NeedsReview,
}

// Individual checks performed by the verifier.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum VerdictCheck {
    TxlineInput,
    Hash,
    Proof,
    Policy,
    Settlement,
}

// Structured verifier result used to gate settlement.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationVerdict {
    pub status: VerdictStatus,
    pub reason: String,
    pub checked: Vec<VerdictCheck>,
}

// Settlement lifecycle state shown in the UI and persisted in the ledger.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SettlementStatus {
    NotStarted,
    EscrowCreated,
    Deposited,
    Released,
    Refunded,
}

// Settlement receipt from Solana Pay, CoralOS sidecar, or future native escrow.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettlementReceipt {
    pub rail: Option<String>,
    pub status: SettlementStatus,
    pub reference: Option<String>,
    pub escrow_pda: Option<String>,
    pub deposit_tx: Option<String>,
    pub release_tx: Option<String>,
    pub explorer_url: Option<String>,
    pub triton_observed: Option<bool>,
    pub triton_slot: Option<u64>,
    pub payment_url: Option<String>,
    pub payment_reference: Option<String>,
    pub payment_memo: Option<String>,
    pub payment_signature: Option<String>,
    pub payment_status: Option<String>,
    pub payment_recipient: Option<String>,
    pub payment_amount_sol: Option<f64>,
}

// Timeline entry for the proof/audit panel.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEntry {
    pub at: String,
    pub label: String,
    pub detail: String,
}

// Full market round persisted to SQLite.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRun {
    pub run_id: String,
    pub track: TrackMode,
    pub trigger: TxLineEvent,
    pub bids: Vec<AgentBid>,
    pub winner: Option<AgentBid>,
    pub delivery: Option<AgentDelivery>,
    pub verdict: Option<VerificationVerdict>,
    pub settlement: Option<SettlementReceipt>,
    pub timeline: Vec<TimelineEntry>,
}

// Chain health/status emitted as chain://slot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainStatus {
    pub cluster: Cluster,
    pub slot: u64,
    pub solana_core: String,
    pub latency_ms: u128,
    pub ts: String,
}

// Snapshot observation for a settlement reference/account/program.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TritonObservation {
    pub kind: String,
    pub signature: Option<String>,
    pub slot: Option<u64>,
    pub blockhash: Option<String>,
    pub account: Option<String>,
    pub program_id: Option<String>,
    pub note: String,
}

// Event payload emitted for each market phase.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketRoundEvent {
    pub run_id: String,
    pub phase: String,
    pub detail: String,
    pub at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationSimulationStatus {
    #[default]
    NotStarted,
    Passed,
    Failed,
    Unavailable,
}

#[allow(dead_code)] // Staged txoracle decoder wire contract.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TxOracleInstructionKind {
    InsertScoresRoot,
    InsertBatchRoot,
    InsertFixturesRoot,
    Unknown,
}

#[allow(dead_code)] // Staged txoracle decoder wire contract.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TxOracleRootEvent {
    pub signature: String,
    pub slot: u64,
    pub program_id: String,
    pub instruction: TxOracleInstructionKind,
    pub epoch_day: Option<u32>,
    pub merkle_root: Option<String>,
    pub root_pda: Option<String>,
    pub fixture_id: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CoralVerb {
    Observed,
    Normalized,
    RootObserved,
    Want,
    AgentThought,
    ToolCall,
    ToolResult,
    Signal,
    ProofRequested,
    ProofReceived,
    ValidationSimulated,
    PaymentRequired,
    WalletConnected,
    PaymentProof,
    PaymentConfirmed,
    Verified,
    Settled,
    Evaluated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoralSession {
    pub id: String,
    pub thread_id: String,
    pub fixture_id: u64,
    pub track: TrackMode,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoralMessage {
    pub id: String,
    pub session_id: String,
    pub thread_id: String,
    pub round: u64,
    pub from: String,
    #[serde(default)]
    pub to: Vec<String>,
    pub verb: CoralVerb,
    pub text: String,
    #[serde(default)]
    pub payload: Option<Value>,
    pub ts: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentTracePhase {
    Observe,
    Derive,
    ToolCall,
    ToolResult,
    LlmReasoning,
    Decision,
    Action,
    Proof,
    Payment,
    Evaluation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTraceEvent {
    pub id: String,
    pub run_id: String,
    pub round: u64,
    pub phase: AgentTracePhase,
    pub summary: String,
    #[serde(default)]
    pub payload: Option<Value>,
    pub ts: String,
}

#[allow(dead_code)] // Browser/PWA wallet context mirror; frontend owns local detection today.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletContext {
    pub provider: String,
    pub public_key: Option<String>,
    pub connected: bool,
    pub cluster: String,
}

// Millisecond-precision UTC timestamp used across timeline and event payloads.
pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
