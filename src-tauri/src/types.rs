use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Cluster {
    Devnet,
    Mainnet,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrackMode {
    Settlement,
    Trading,
    Fan,
}

impl std::fmt::Display for TrackMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let value = match self {
            Self::Settlement => "settlement",
            Self::Trading => "trading",
            Self::Fan => "fan",
        };
        f.write_str(value)
    }
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Score {
    pub home: i64,
    pub away: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TxLineProofReceipt {
    pub fixture_id: u64,
    pub seq: Option<u64>,
    pub stat_key: Option<u64>,
    pub merkle_root: Option<String>,
    pub stat_proof_hash: Option<String>,
    pub txline_program: Option<String>,
    pub verified: bool,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TxLineEvent {
    pub id: String,
    pub kind: TxLineEventKind,
    pub fixture_id: u64,
    pub title: String,
    pub body: String,
    pub ts: String,
    pub raw: Option<Value>,
    pub odds: Option<Vec<OddsQuote>>,
    pub score: Option<Score>,
    pub proof: Option<TxLineProofReceipt>,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VerdictStatus {
    Pass,
    Fail,
    NeedsReview,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum VerdictCheck {
    TxlineInput,
    Hash,
    Proof,
    Policy,
    Settlement,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationVerdict {
    pub status: VerdictStatus,
    pub reason: String,
    pub checked: Vec<VerdictCheck>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SettlementStatus {
    NotStarted,
    EscrowCreated,
    Deposited,
    Released,
    Refunded,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettlementReceipt {
    pub status: SettlementStatus,
    pub reference: Option<String>,
    pub escrow_pda: Option<String>,
    pub deposit_tx: Option<String>,
    pub release_tx: Option<String>,
    pub explorer_url: Option<String>,
    pub triton_observed: Option<bool>,
    pub triton_slot: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEntry {
    pub at: String,
    pub label: String,
    pub detail: String,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainStatus {
    pub cluster: Cluster,
    pub slot: u64,
    pub solana_core: String,
    pub latency_ms: u128,
    pub ts: String,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketRoundEvent {
    pub run_id: String,
    pub phase: String,
    pub detail: String,
    pub at: String,
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub fn mock_events() -> Vec<TxLineEvent> {
    let ts = now_iso();
    vec![
        TxLineEvent {
            id: "evt-odds-1".to_string(),
            kind: TxLineEventKind::OddsMove,
            fixture_id: 17_588_245,
            title: "Brazil price shortened 6.2pp".to_string(),
            body: "TxLINE odds moved after sustained pressure. Trigger threshold met for agent round.".to_string(),
            ts: ts.clone(),
            raw: None,
            odds: Some(vec![
                OddsQuote {
                    fixture_id: 17_588_245,
                    outcome: "home".to_string(),
                    decimal: 1.82,
                    implied_probability: 0.549,
                    source: None,
                    ts: ts.clone(),
                },
                OddsQuote {
                    fixture_id: 17_588_245,
                    outcome: "draw".to_string(),
                    decimal: 3.70,
                    implied_probability: 0.270,
                    source: None,
                    ts: ts.clone(),
                },
                OddsQuote {
                    fixture_id: 17_588_245,
                    outcome: "away".to_string(),
                    decimal: 4.60,
                    implied_probability: 0.217,
                    source: None,
                    ts: ts.clone(),
                },
            ]),
            score: None,
            proof: None,
        },
        TxLineEvent {
            id: "evt-goal-1".to_string(),
            kind: TxLineEventKind::Goal,
            fixture_id: 17_588_245,
            title: "Goal: Brazil 1-0 England".to_string(),
            body: "Scores stream produced a goal event. Fan mode should explain match and market impact.".to_string(),
            ts,
            raw: None,
            odds: None,
            score: Some(Score { home: 1, away: 0 }),
            proof: None,
        },
    ]
}
