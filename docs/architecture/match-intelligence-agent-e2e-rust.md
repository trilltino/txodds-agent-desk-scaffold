# Match Intelligence Agent E2E Rust Implementation

This document is the implementation blueprint for turning the current desktop
agent trace into a real Rust agent runtime.

It is intentionally concrete. The code blocks are shaped to fit this repo's
current Tauri backend, types, proof bridge, TxLINE ingest, ledger, and CoralOS
transcript surface. The target is not a role-play market with pretend agents.
The target is one production-minded `match-intelligence-agent` that observes live
TxLINE data, derives deterministic features, asks txoracle for read-only proof
validation, optionally asks Venice for a bounded explanation, executes only
allowed local actions, and records whether its signal was useful later.

## Current State

The app is already desktop-first and live-only:

- Rust owns TxLINE credentials and live SSE ingest in
  `src-tauri/src/services/txline/ingest.rs`.
- Normalized live data reaches the UI as `TxLineEvent`.
- Proof validation is read-only and lives behind
  `src-tauri/src/services/proof/validation.rs` plus
  `runtime/sidecars/txoracle-validation-bridge.mjs`.
- `run_agent_round` in `src-tauri/src/commands/intelligence.rs` now delegates
  directly to `services::agent::runtime::run_match_intelligence_round`; it does
  not call `services::coral::market::run_round`.
- `src-tauri/src/domain/agent.rs` contains the public contracts:
  `AgentSignal`, `AgentDecision`, `AgentAction`, `PolicyCheck`, and metrics.
- `coral-agents/match-intelligence-agent/coral-agent.toml` is a CoralOS
  launchable manifest for the same agent identity. The Rust desktop runtime
  remains the decision engine.
- `src-tauri/src/services/coralos/console.rs` mirrors each completed run into
  CoralOS Console through the local session and puppet thread APIs when
  `CORALOS_CONSOLE_ENABLED=1`.

The old Coral market round is retired compatibility code. It is kept only for
historical run shape compatibility and should not be used for new product paths.

## Implementation Status

Implemented in this repo:

- Real Rust agent runtime:
  `src-tauri/src/services/agent/runtime.rs`.
- Deterministic context, feature, policy, tool, and evaluation modules:
  `src-tauri/src/services/agent/{context,features,policy,tools,evaluation}.rs`.
- SDK-free Venice/OpenAI-compatible explanation client with deterministic
  fallback: `src-tauri/src/services/llm`.
- Read-only txoracle proof request path through `ValidationBridge`; missing,
  unavailable, or `not_started` proof remains non-pass.
- Structured ledger persistence for observations, signals, decisions, proof
  receipts, and LLM calls.
- CoralOS Console publish bridge:
  `src-tauri/src/services/coralos/console.rs`.
- CoralOS launchable agent manifest plus a minimal MCP participant stub under
  `coral-agents/match-intelligence-agent`.

Not intentionally implemented:

- No fake proof pass.
- No autonomous signing.
- No background auto-trading.
- No browser preview requirement; the production surface remains the Tauri
  desktop app.

## What The Real Agent Does

The real agent is a long-lived Rust service with a short per-event decision
loop. Its job is to convert live sports data into auditable, proof-aware product
actions.

On each live event it should:

1. Observe a normalized `TxLineEvent` from live TxLINE SSE.
2. Build an `AgentContext` from the event, recent fixture state, proof state,
   ledger state, and configured thresholds.
3. Derive deterministic `MarketFeatures`.
4. Emit zero or one `AgentSignal`.
5. Ask the txoracle validation sidecar for a read-only proof receipt when the
   event is settlement/proof relevant.
6. Gate every action through deterministic Rust policy.
7. Use Venice only to produce a short explanation from already-derived facts.
8. Execute allowed local actions: watch, notify, simulate position, fetch proof,
   or mark resolution ready.
9. Persist the observation, signal, decision, tool calls, proof receipt, LLM
   usage, and later evaluation.
10. Emit Coral transcript and `agent://trace` events for the UI.

It should not:

- Invent proof payloads.
- Treat `not_started` txoracle validation as pass.
- Sign or send transactions.
- Let the LLM decide proof validity, settlement readiness, payment release, or
  risk limits.
- Put secrets into frontend events, transcripts, prompts, or SQLite rows.

## Why This Is Valuable

The agent adds real product leverage because it compresses live feed noise into
explainable, verifiable actions.

| Capability | Without the agent | With the Rust agent |
| --- | --- | --- |
| Live feed handling | UI receives many raw-ish events | Events become scored observations with fixture memory |
| Odds/score movement | Humans eyeball panels | Rust computes reproducible movement and severity |
| Proof readiness | User manually interprets proof drawer | Agent requests proof only when data is actionable |
| Txoracle trust | Easy to accidentally trust missing proof | Missing proof hard-blocks settlement and reports `not_started` |
| LLM use | Risk of "AI says yes" | LLM explains code decisions and cannot bypass gates |
| UI trace | Current trace is generated after a round | Trace becomes the actual execution log |
| Evaluation | No learning loop | Signals expire/pass/fail against later live events |
| Auditing | One persisted run JSON | Structured tables for observations, decisions, tools, proof, LLM |

## Target Module Layout

The Rust backend now uses this layout:

```text
src-tauri/src/services/
  agent/
    mod.rs
    context.rs       # Build AgentContext from TxLINE + ledger + proof inputs
    features.rs      # Deterministic feature extraction
    policy.rs        # Deterministic gates for every action
    runtime.rs       # The event -> signal -> decision -> action loop
    tools.rs         # Local tools: proof, watch, notify, simulation
    evaluation.rs    # Later outcome checks and metrics
  llm/
    mod.rs
    venice.rs        # OpenAI-compatible Venice client
    schemas.rs       # Strict JSON request/response contracts
  coralos/
    console.rs       # CoralOS Console local-session/puppet publisher
```

Keep these existing modules:

```text
src-tauri/src/services/proof/validation.rs   # Read-only txoracle bridge
src-tauri/src/services/txline/ingest.rs      # Live SSE ingest
src-tauri/src/services/coralos/protocol.rs   # Transcript messages
src-tauri/src/services/coralos/transcript.rs # JSONL audit export
src-tauri/src/services/coralos/console.rs    # CoralOS Console thread publish
src-tauri/src/domain/agent.rs                # Public signal/decision types
```

Retired compatibility module:

```text
src-tauri/src/services/coral/market.rs
```

## E2E Flow

```text
TxLINE odds/scores SSE
  -> src-tauri/src/services/txline/ingest.rs
  -> TxLineEvent
  -> services::agent::runtime::run_match_intelligence_round()
  -> AgentContext
  -> MarketFeatures
  -> AgentSignal?
  -> txoracle proof receipt when relevant
  -> policy checks
  -> Venice explanation when configured
  -> AgentDecision
  -> local action
  -> ledger persistence
  -> coralos transcript + agent trace + UI events
  -> optional CoralOS Console thread publish
  -> later evaluation against future live events
```

## CoralOS Console Integration

The external `trilltino/solana_coralOS` repo exposes a local console at
`/ui/console` and local session APIs under `/api/v1/local/session`. The desktop
runtime uses that model conservatively:

1. It creates or reuses a CoralOS local session.
2. It creates a puppet thread for `match-intelligence-agent`.
3. It publishes the real `CoralMessage` transcript generated by the Rust run.
4. It records the publish result in the run timeline and trace.

This makes the agent visible in CoralOS without moving the decision boundary out
of Rust. The CoralOS participant stub in `coral-agents/match-intelligence-agent`
exists so the agent identity can be launched by CoralOS, while this desktop app
still owns TxLINE credentials, proof validation, policy, and persistence.

Configuration:

```text
CORAL_SERVER_URL=http://localhost:5555
CORAL_TOKEN=dev
CORALOS_NAMESPACE=default
CORALOS_SESSION_ID=
CORALOS_CONSOLE_ENABLED=1
```

If CoralOS is not running, publish status is recorded as `unavailable` and the
agent run still completes locally. That failure does not turn proof into pass
and does not affect settlement gates.

## Config Additions

The backend config should hold LLM secrets; the frontend should receive only a
boolean.

```rust
// src-tauri/src/config.rs

#[derive(Debug, Clone)]
pub struct AppConfig {
    // existing fields...
    pub llm_provider: String,
    pub llm_model: String,
    pub venice_api_key: Option<String>,
    pub llm_trace: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicConfig {
    // existing fields...
    pub llm_configured: bool,
    pub llm_provider: String,
    pub llm_model: String,
}

impl AppConfig {
    pub fn load() -> Self {
        Self {
            // existing fields...
            llm_provider: env_or_default("LLM_PROVIDER", "venice"),
            llm_model: env_or_default("LLM_MODEL", "default"),
            venice_api_key: secret("VENICE_API_KEY", "venice_api_key"),
            llm_trace: bool_env("LLM_TRACE", false),
        }
    }

    pub fn public(&self) -> PublicConfig {
        PublicConfig {
            // existing fields...
            llm_configured: self.venice_api_key.is_some(),
            llm_provider: self.llm_provider.clone(),
            llm_model: self.llm_model.clone(),
        }
    }
}
```

The actual model id should remain an env override. Do not hardcode a single
Venice model forever because provider model names drift.

## LLM Client

This client is intentionally SDK-free. It uses `reqwest`, which the crate already
has. The agent can run without it; missing config produces deterministic
fallback explanations.

```rust
// src-tauri/src/services/llm/mod.rs

pub mod schemas;
pub mod venice;

pub use schemas::{LlmRequest, LlmResponse};
pub use venice::VeniceClient;
```

```rust
// src-tauri/src/services/llm/schemas.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmRequest {
    pub system: String,
    pub user: String,
    pub model: String,
    pub max_tokens: u32,
    pub temperature: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmResponse {
    pub provider: String,
    pub model: String,
    pub text: String,
    pub used: bool,
}

impl LlmResponse {
    pub fn fallback(text: impl Into<String>) -> Self {
        Self {
            provider: "none".to_string(),
            model: "deterministic".to_string(),
            text: text.into(),
            used: false,
        }
    }
}
```

```rust
// src-tauri/src/services/llm/venice.rs

use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::config::AppConfig;
use crate::error::AppError;

use super::schemas::{LlmRequest, LlmResponse};

#[derive(Clone)]
pub struct VeniceClient {
    http: Client,
}

impl VeniceClient {
    pub fn new(http: Client) -> Self {
        Self { http }
    }

    pub async fn complete(
        &self,
        config: &AppConfig,
        request: LlmRequest,
    ) -> Result<LlmResponse, AppError> {
        let Some(api_key) = config.venice_api_key.as_deref() else {
            return Ok(LlmResponse::fallback(
                "LLM not configured; deterministic explanation used",
            ));
        };

        let payload = ChatCompletionRequest {
            model: request.model.clone(),
            temperature: request.temperature,
            max_tokens: request.max_tokens.max(256),
            messages: vec![
                ChatMessage {
                    role: "system",
                    content: request.system,
                },
                ChatMessage {
                    role: "user",
                    content: request.user,
                },
            ],
        };

        let response = self
            .http
            .post("https://api.venice.ai/api/v1/chat/completions")
            .bearer_auth(api_key)
            .json(&payload)
            .send()
            .await
            .map_err(|err| AppError::Task(format!("Venice request failed: {err}")))?;

        if !response.status().is_success() {
            return Err(AppError::Task(format!(
                "Venice HTTP {}",
                response.status()
            )));
        }

        let body = response
            .json::<ChatCompletionResponse>()
            .await
            .map_err(|err| AppError::Task(format!("Venice JSON failed: {err}")))?;

        let text = body
            .choices
            .first()
            .map(|choice| choice.message.content.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "No LLM explanation returned".to_string());

        Ok(LlmResponse {
            provider: "venice".to_string(),
            model: request.model,
            text,
            used: true,
        })
    }
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Serialize)]
struct ChatMessage {
    role: &'static str,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatChoiceMessage,
}

#[derive(Debug, Deserialize)]
struct ChatChoiceMessage {
    content: String,
}
```

The prompt must be built from sanitized, bounded facts, not raw untrusted JSON.
The LLM should never receive private tokens or entire TxLINE payloads.

## Agent Context

`AgentContext` is the per-event state packet. It gives the runtime one stable
thing to pass into features, policy, tools, LLM, persistence, and UI events.

```rust
// src-tauri/src/services/agent/context.rs

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
        run_id: format!("run-{}", uuid::Uuid::new_v4()),
        track,
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
        event,
        proof,
    }
}
```

## Feature Extraction

Feature extraction should be pure and unit-tested. It should not call the
network, mutate state, or use the LLM.

```rust
// src-tauri/src/services/agent/features.rs

use serde::{Deserialize, Serialize};

use crate::types::{TxLineEvent, TxLineEventKind, ValidationSimulationStatus};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketFeatures {
    pub fixture_id: u64,
    pub kind: String,
    pub has_score: bool,
    pub has_odds: bool,
    pub best_implied_probability: Option<f64>,
    pub proof_present: bool,
    pub root_present: bool,
    pub txoracle_passed: bool,
    pub severity_score: f64,
    pub actionability_score: f64,
    pub reasons: Vec<String>,
}

pub fn derive_features(event: &TxLineEvent) -> MarketFeatures {
    let mut features = MarketFeatures {
        fixture_id: event.fixture_id,
        kind: format!("{:?}", event.kind),
        has_score: event.score.is_some(),
        has_odds: event.odds.as_ref().map(|items| !items.is_empty()).unwrap_or(false),
        best_implied_probability: best_implied_probability(event),
        proof_present: event
            .proof
            .as_ref()
            .map(|proof| proof.proof_present)
            .unwrap_or(false),
        root_present: event
            .proof
            .as_ref()
            .map(|proof| proof.root_present)
            .unwrap_or(false),
        txoracle_passed: event
            .proof
            .as_ref()
            .map(|proof| matches!(proof.simulation_status, ValidationSimulationStatus::Passed))
            .unwrap_or(false),
        ..MarketFeatures::default()
    };

    match event.kind {
        TxLineEventKind::Goal => {
            features.severity_score += 0.80;
            features.reasons.push("goal changes match state".to_string());
        }
        TxLineEventKind::RedCard => {
            features.severity_score += 0.78;
            features.reasons.push("red card can reprice market".to_string());
        }
        TxLineEventKind::FinalWhistle => {
            features.severity_score += 0.72;
            features.reasons.push("final whistle can trigger resolution".to_string());
        }
        TxLineEventKind::OddsMove | TxLineEventKind::OddsUpdate => {
            features.severity_score += 0.64;
            features.reasons.push("odds update observed".to_string());
        }
        TxLineEventKind::ProofReceived => {
            features.severity_score += 0.70;
            features.reasons.push("proof receipt arrived".to_string());
        }
        _ => {
            features.severity_score += 0.35;
            features.reasons.push("context update observed".to_string());
        }
    }

    if features.has_odds {
        features.actionability_score += 0.20;
    }
    if features.has_score {
        features.actionability_score += 0.20;
    }
    if features.proof_present {
        features.actionability_score += 0.20;
    }
    if features.root_present {
        features.actionability_score += 0.20;
    }
    if features.txoracle_passed {
        features.actionability_score += 0.20;
    }

    features.severity_score = features.severity_score.min(1.0);
    features.actionability_score = features.actionability_score.min(1.0);
    features
}

fn best_implied_probability(event: &TxLineEvent) -> Option<f64> {
    event
        .odds
        .as_ref()?
        .iter()
        .map(|quote| quote.implied_probability)
        .filter(|value| value.is_finite())
        .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
}
```

## Signal Builder

A signal is the agent saying "this matters." It is not yet permission to act.

```rust
// src-tauri/src/services/agent/runtime.rs

use std::collections::BTreeMap;

use serde_json::json;

use crate::domain::agent::{AgentSignal, SignalSeverity, SignalType};
use crate::types::{now_iso, TxLineEventKind};

use super::context::AgentContext;
use super::features::MarketFeatures;

pub fn build_signal(
    context: &AgentContext,
    features: &MarketFeatures,
) -> Option<AgentSignal> {
    if features.severity_score < 0.55 {
        return None;
    }

    let signal_type = match context.event.kind {
        TxLineEventKind::OddsMove | TxLineEventKind::OddsUpdate => SignalType::SharpOddsMove,
        TxLineEventKind::Goal | TxLineEventKind::ScoreUpdate => SignalType::ScoreEvent,
        TxLineEventKind::RedCard => SignalType::RedCardReprice,
        TxLineEventKind::FinalWhistle => SignalType::ProofReady,
        TxLineEventKind::ProofReceived => SignalType::ProofReady,
        _ => return None,
    };

    let severity = if features.severity_score >= 0.85 {
        SignalSeverity::Critical
    } else if features.severity_score >= 0.70 {
        SignalSeverity::High
    } else if features.severity_score >= 0.55 {
        SignalSeverity::Medium
    } else {
        SignalSeverity::Low
    };

    let mut measured = BTreeMap::new();
    measured.insert("severityScore".to_string(), json!(features.severity_score));
    measured.insert(
        "actionabilityScore".to_string(),
        json!(features.actionability_score),
    );
    measured.insert("proofPresent".to_string(), json!(features.proof_present));
    measured.insert("rootPresent".to_string(), json!(features.root_present));
    measured.insert("txoraclePassed".to_string(), json!(features.txoracle_passed));
    if let Some(probability) = features.best_implied_probability {
        measured.insert("bestImpliedProbability".to_string(), json!(probability));
    }

    Some(AgentSignal {
        id: format!("signal-{}", uuid::Uuid::new_v4()),
        fixture_id: context.event.fixture_id,
        source_event_id: context.event.id.clone(),
        signal_type,
        severity,
        confidence: features.severity_score.max(features.actionability_score),
        features: measured,
        rationale: features.reasons.join("; "),
        created_at: now_iso(),
    })
}
```

## Policy Gates

Policy is where the agent earns trust. It is deterministic, local, and
reviewable. The LLM cannot override these checks.

```rust
// src-tauri/src/services/agent/policy.rs

use crate::domain::agent::{
    AgentAction, AgentDecision, AgentSignal, ExecutionStatus, PolicyCheck, SignalSeverity,
    SignalType,
};
use crate::services::proof::ProofGateDecision;
use crate::types::{now_iso, TrackMode};

use super::context::AgentContext;
use super::features::MarketFeatures;

pub fn choose_action(
    context: &AgentContext,
    signal: &AgentSignal,
    features: &MarketFeatures,
    proof_gate: Option<&ProofGateDecision>,
    explanation: String,
) -> AgentDecision {
    let mut checks = Vec::new();

    checks.push(PolicyCheck {
        name: "live_txline_event".to_string(),
        passed: context.event.fixture_id > 0,
        detail: format!("fixture_id={}", context.event.fixture_id),
    });

    checks.push(PolicyCheck {
        name: "signal_threshold".to_string(),
        passed: signal.confidence >= 0.55,
        detail: format!("confidence={:.3}", signal.confidence),
    });

    let proof_passed = proof_gate.map(|gate| gate.pass).unwrap_or(false);
    checks.push(PolicyCheck {
        name: "txoracle_proof_gate".to_string(),
        passed: proof_passed,
        detail: proof_gate
            .map(|gate| gate.reason.clone())
            .unwrap_or_else(|| "proof not requested for this action".to_string()),
    });

    let requested_action = match (context.track, &signal.signal_type) {
        (TrackMode::Settlement, SignalType::ProofReady) => AgentAction::TriggerResolution,
        (TrackMode::Settlement, _) => AgentAction::FetchProof,
        (TrackMode::Trading, SignalType::SharpOddsMove) => AgentAction::SimulatePosition,
        (TrackMode::Fan, SignalType::ScoreEvent | SignalType::RedCardReprice) => {
            AgentAction::Notify
        }
        _ => AgentAction::Watch,
    };

    let action = match requested_action {
        AgentAction::TriggerResolution if !proof_passed => AgentAction::FetchProof,
        other => other,
    };

    let blocked = matches!(action, AgentAction::TriggerResolution) && !proof_passed;
    let execution_status = if blocked {
        ExecutionStatus::Blocked
    } else if checks.iter().all(|check| check.passed || check.name == "txoracle_proof_gate") {
        ExecutionStatus::Pending
    } else {
        ExecutionStatus::Blocked
    };

    let severity_bonus = match signal.severity {
        SignalSeverity::Critical => 0.05,
        SignalSeverity::High => 0.03,
        SignalSeverity::Medium | SignalSeverity::Low => 0.0,
    };

    AgentDecision {
        id: format!("decision-{}", uuid::Uuid::new_v4()),
        signal_id: signal.id.clone(),
        action,
        confidence: (signal.confidence + features.actionability_score + severity_bonus).min(1.0),
        policy_checks: checks,
        explanation,
        execution_status,
        created_at: now_iso(),
    }
}
```

## Proof Tool

The proof tool is a Rust adapter around the existing `ValidationBridge`. It
should preserve the current fail-closed behavior: missing IDL/proof/root/seq
returns `not_started`, not pass.

```rust
// src-tauri/src/services/agent/tools.rs

use tauri::{AppHandle, Emitter};

use crate::config::AppConfig;
use crate::error::AppError;
use crate::services::proof::{self, ProofGateDecision, ValidationBridge};
use crate::types::{AgentRun, TxLineProofReceipt};

pub async fn request_proof(
    bridge: &ValidationBridge,
    http: &reqwest::Client,
    config: &AppConfig,
    run: &AgentRun,
) -> (TxLineProofReceipt, ProofGateDecision) {
    let receipt = bridge.receipt_for_run(http, config, run).await;
    let gate = proof::gate_receipt(run, &receipt);
    (receipt, gate)
}

pub fn emit_notification(
    app: &AppHandle,
    title: impl Into<String>,
    body: impl Into<String>,
) -> Result<(), AppError> {
    app.emit(
        crate::event_bus::APP_NOTIFICATION,
        serde_json::json!({
            "title": title.into(),
            "body": body.into(),
            "ts": crate::types::now_iso()
        }),
    )
    .map_err(|err| AppError::Task(format!("notification emit failed: {err}")))
}
```

## LLM Explanation Prompt

The prompt should be boring and strict. It is not a decision prompt. It is an
explanation prompt.

```rust
// src-tauri/src/services/agent/runtime.rs

use crate::services::llm::{LlmRequest, LlmResponse, VeniceClient};

use super::context::AgentContext;
use super::features::MarketFeatures;

async fn explain_decision(
    llm: &VeniceClient,
    config: &crate::config::AppConfig,
    context: &AgentContext,
    features: &MarketFeatures,
) -> LlmResponse {
    let facts = serde_json::json!({
        "fixtureId": context.event.fixture_id,
        "track": context.track,
        "eventKind": context.event.kind,
        "title": context.event.title,
        "features": features,
    });

    let request = LlmRequest {
        system: [
            "You explain a Rust sports-data agent decision.",
            "Use only the supplied facts.",
            "Do not claim proof passed unless txoraclePassed is true.",
            "Do not recommend signing, payment release, or settlement.",
            "Return two concise sentences.",
        ]
        .join(" "),
        user: facts.to_string(),
        model: config.llm_model.clone(),
        max_tokens: 300,
        temperature: 0.2,
    };

    match llm.complete(config, request).await {
        Ok(response) => response,
        Err(err) => LlmResponse::fallback(format!(
            "LLM unavailable; deterministic explanation used: {err}"
        )),
    }
}
```

## Runtime Loop

This is the core replacement for the current `coral::market::run_round` entry.
It returns the existing `AgentRun` shape so the UI can migrate without a huge
frontend rewrite, but the run is now produced by real agent steps.

```rust
// src-tauri/src/services/agent/runtime.rs

use tauri::{AppHandle, Emitter};

use crate::domain::agent::{AgentAction, AgentDecision, ExecutionStatus};
use crate::error::AppError;
use crate::event_bus;
use crate::services::coralos;
use crate::services::llm::VeniceClient;
use crate::services::proof::{self, ProofGateDecision};
use crate::state::DesktopState;
use crate::types::{
    now_iso, AgentDelivery, AgentRun, AgentTraceEvent, AgentTracePhase, TimelineEntry,
    TrackMode, TxLineEvent, TxLineProofReceipt, VerificationVerdict,
};

use super::context;
use super::features;
use super::policy;
use super::tools;

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

    let mut context =
        context::build_context(&state.config, track, trigger, None, recent_runs);
    let mut timeline = Vec::new();
    let mut trace = Vec::new();

    push_timeline(&mut timeline, "OBSERVE", "live TxLINE event observed");
    emit_trace(
        &app,
        &mut trace,
        &context.run_id,
        AgentTracePhase::Observe,
        "live TxLINE event observed",
        Some(serde_json::json!({ "event": context.event })),
    );

    let mut features = features::derive_features(&context.event);
    push_timeline(&mut timeline, "FEATURES", "market features derived");
    emit_trace(
        &app,
        &mut trace,
        &context.run_id,
        AgentTracePhase::Derive,
        "market features derived",
        Some(serde_json::json!({ "features": features })),
    );

    let mut run = empty_run(context.run_id.clone(), track, context.event.clone(), timeline);

    let proof_required = matches!(
        track,
        TrackMode::Settlement
    ) || matches!(
        context.event.kind,
        crate::types::TxLineEventKind::FinalWhistle
            | crate::types::TxLineEventKind::ProofReceived
    );

    let mut proof_receipt: Option<TxLineProofReceipt> = None;
    let mut proof_gate: Option<ProofGateDecision> = None;
    if proof_required {
        let (receipt, gate) = tools::request_proof(
            &state.validation_bridge,
            &state.client,
            &state.config,
            &run,
        )
        .await;
        context.proof = Some(receipt.clone());
        proof_receipt = Some(receipt.clone());
        proof_gate = Some(gate.clone());
        features.proof_present = receipt.proof_present;
        features.root_present = receipt.root_present;
        features.txoracle_passed = gate.pass;

        push_timeline(
            &mut run.timeline,
            "PROOF_GATE",
            format!(
                "{}: {}",
                if gate.pass { "pass" } else { "needs_review" },
                gate.reason
            ),
        );
        emit_trace(
            &app,
            &mut trace,
            &context.run_id,
            AgentTracePhase::Proof,
            receipt.note.clone(),
            Some(serde_json::json!({ "receipt": receipt, "gate": gate })),
        );
    }

    let llm = VeniceClient::new(state.client.clone());
    let explanation = explain_decision(&llm, &state.config, &context, &features)
        .await
        .text;

    let Some(signal) = build_signal(&context, &features) else {
        push_timeline(&mut run.timeline, "DECISION", "no actionable signal emitted");
        persist_and_emit(
            app,
            state,
            &mut run,
            trace,
            proof_receipt.as_ref(),
            None,
        )?;
        return Ok(run);
    };

    let decision = policy::choose_action(
        &context,
        &signal,
        &features,
        proof_gate.as_ref(),
        explanation,
    );
    push_timeline(
        &mut run.timeline,
        "DECISION",
        format!("{:?} -> {:?}", signal.signal_type, decision.action),
    );
    emit_trace(
        &app,
        &mut trace,
        &context.run_id,
        AgentTracePhase::Decision,
        decision.explanation.clone(),
        Some(serde_json::json!({
            "signal": signal,
            "decision": decision,
        })),
    );

    execute_allowed_action(&app, &mut run, &decision, proof_gate.as_ref())?;
    persist_and_emit(
        app,
        state,
        &mut run,
        trace,
        proof_receipt.as_ref(),
        Some(&decision),
    )?;
    Ok(run)
}

fn empty_run(
    run_id: String,
    track: TrackMode,
    trigger: TxLineEvent,
    timeline: Vec<TimelineEntry>,
) -> AgentRun {
    AgentRun {
        run_id,
        track,
        trigger,
        bids: Vec::new(),
        winner: None,
        delivery: None,
        verdict: None,
        settlement: None,
        timeline,
    }
}

fn execute_allowed_action(
    app: &AppHandle,
    run: &mut AgentRun,
    decision: &AgentDecision,
    proof_gate: Option<&ProofGateDecision>,
) -> Result<(), AppError> {
    if matches!(decision.execution_status, ExecutionStatus::Blocked) {
        push_timeline(
            &mut run.timeline,
            "ACTION_BLOCKED",
            "policy blocked the requested action",
        );
        return Ok(());
    }

    match decision.action {
        AgentAction::Notify => {
            tools::emit_notification(
                app,
                "Match intelligence signal",
                decision.explanation.clone(),
            )?;
            push_timeline(&mut run.timeline, "ACTION", "desktop notification emitted");
        }
        AgentAction::SimulatePosition => {
            run.delivery = Some(AgentDelivery {
                agent_id: "match-intelligence-agent".to_string(),
                title: "Simulated market response".to_string(),
                payload: serde_json::json!({
                    "mode": "simulation",
                    "fixtureId": run.trigger.fixture_id,
                    "explanation": decision.explanation,
                })
                .to_string(),
                sha256: sha256_hex(&decision.explanation),
                citations: vec![run.trigger.id.clone()],
                strategy: Some("observe_only".to_string()),
                risk: Some("no funds moved".to_string()),
                fan_copy: None,
            });
            push_timeline(&mut run.timeline, "ACTION", "position simulation recorded");
        }
        AgentAction::FetchProof => {
            push_timeline(&mut run.timeline, "ACTION", "proof requested or still pending");
        }
        AgentAction::TriggerResolution => {
            let passed = proof_gate.map(|gate| gate.pass).unwrap_or(false);
            if !passed {
                push_timeline(
                    &mut run.timeline,
                    "ACTION_BLOCKED",
                    "resolution blocked because txoracle proof gate did not pass",
                );
            } else {
                push_timeline(
                    &mut run.timeline,
                    "ACTION",
                    "resolution ready; external signing still requires explicit user flow",
                );
            }
        }
        AgentAction::Watch | AgentAction::Ignore => {
            push_timeline(&mut run.timeline, "ACTION", "watchlist state recorded");
        }
    }
    Ok(())
}

fn persist_and_emit(
    app: AppHandle,
    state: &DesktopState,
    run: &mut AgentRun,
    trace: Vec<AgentTraceEvent>,
    proof_receipt: Option<&TxLineProofReceipt>,
    decision: Option<&AgentDecision>,
) -> Result<(), AppError> {
    run.verdict = proof_receipt
        .map(|receipt| proof::gate_receipt(run, receipt))
        .map(|gate| proof::verdict_from_gate(&gate))
        .or_else(|| {
            decision.map(|_| VerificationVerdict {
                status: crate::types::VerdictStatus::NeedsReview,
                reason: "no proof gate required for this non-settlement decision".to_string(),
                checked: vec![crate::types::VerdictCheck::Policy],
            })
        });

    {
        let ledger = state
            .ledger
            .lock()
            .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
        ledger.upsert_run(run)?;
    }

    let session = coralos::protocol::start_session(&run.run_id, run.trigger.fixture_id, run.track);
    let _ = app.emit(event_bus::CORAL_SESSION, &session);
    // Trace events were emitted live as each phase completed. This function
    // persists them and emits final proof/session artifacts.
    if let Some(receipt) = proof_receipt {
        let _ = app.emit(event_bus::WEB3_PROOF_RECEIPT, receipt);
    }
    let _ = coralos::transcript::persist_run_artifacts(
        &state.replay_dir,
        &run.run_id,
        &[],
        &trace,
        proof_receipt,
    );
    Ok(())
}

fn push_timeline(
    timeline: &mut Vec<TimelineEntry>,
    label: impl Into<String>,
    detail: impl Into<String>,
) {
    timeline.push(TimelineEntry {
        at: now_iso(),
        label: label.into(),
        detail: detail.into(),
    });
}

fn emit_trace(
    app: &AppHandle,
    trace: &mut Vec<AgentTraceEvent>,
    run_id: &str,
    phase: AgentTracePhase,
    summary: impl Into<String>,
    payload: Option<serde_json::Value>,
) {
    let event = AgentTraceEvent {
        id: format!("trace-{}", uuid::Uuid::new_v4()),
        run_id: run_id.to_string(),
        round: trace.len() as u64 + 1,
        phase,
        summary: summary.into(),
        payload,
        ts: now_iso(),
    };
    let _ = app.emit(event_bus::AGENT_TRACE, &event);
    trace.push(event);
}

fn sha256_hex(text: &str) -> String {
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}
```

## Command Replacement

`run_agent_round` can keep the same Tauri command signature and delegate to the
new runtime.

```rust
// src-tauri/src/commands/intelligence.rs

#[tauri::command]
pub async fn run_agent_round(
    trigger: TxLineEvent,
    track: TrackMode,
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<AgentRun, AppError> {
    crate::services::agent::runtime::run_match_intelligence_round(
        app,
        &state,
        trigger,
        track,
    )
    .await
}
```

The old `coral::market::run_round` path can remain under a feature flag or test
helper while the new runtime stabilizes.

## Live Ingest Auto-Trigger

Today the UI can manually start a round from a selected event. The more complete
agent should have an optional backend auto-trigger so it behaves like an agent,
not just a button.

The cleanest implementation is a bounded channel:

```rust
// src-tauri/src/state.rs

pub struct DesktopState {
    // existing fields...
    pub agent_tx: tokio::sync::mpsc::Sender<AgentWorkItem>,
}

#[derive(Debug, Clone)]
pub struct AgentWorkItem {
    pub event: crate::types::TxLineEvent,
    pub track: crate::types::TrackMode,
}
```

`txline::ingest::emit_event` should continue emitting to the UI. A separate
classifier can enqueue only events worth an agent round:

```rust
pub fn should_enqueue_agent(event: &TxLineEvent) -> bool {
    matches!(
        event.kind,
        TxLineEventKind::OddsMove
            | TxLineEventKind::OddsUpdate
            | TxLineEventKind::Goal
            | TxLineEventKind::RedCard
            | TxLineEventKind::FinalWhistle
            | TxLineEventKind::ProofReceived
    )
}
```

Keep backpressure strict. If the channel is full, drop low-severity work and
emit an ingest status. Do not spawn unbounded agent tasks per SSE message.

## Ledger Tables

Persisting only complete `AgentRun` JSON works for the current UI, but a real
agent needs structured memory for evaluation and debugging.

```sql
CREATE TABLE IF NOT EXISTS agent_observations (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    fixture_id INTEGER NOT NULL,
    event_id TEXT NOT NULL,
    event_kind TEXT NOT NULL,
    event_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_signals (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    fixture_id INTEGER NOT NULL,
    signal_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_decisions (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    signal_id TEXT,
    action TEXT NOT NULL,
    decision_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_tool_calls (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    status TEXT NOT NULL,
    request_json TEXT NOT NULL,
    response_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_llm_calls (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    used INTEGER NOT NULL,
    prompt_hash TEXT NOT NULL,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proof_receipts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    fixture_id INTEGER NOT NULL,
    seq INTEGER,
    status TEXT NOT NULL,
    verified INTEGER NOT NULL,
    receipt_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_evaluations (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    signal_id TEXT,
    outcome TEXT NOT NULL,
    score REAL NOT NULL,
    evaluation_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
```

Add methods to `src-tauri/src/services/ledger/store.rs` rather than scattering
SQLite calls:

```rust
impl LedgerStore {
    pub fn insert_agent_signal(
        &self,
        run_id: &str,
        signal: &crate::domain::agent::AgentSignal,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "
            INSERT INTO agent_signals (id, run_id, fixture_id, signal_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(id) DO UPDATE SET signal_json = excluded.signal_json
            ",
            rusqlite::params![
                signal.id,
                run_id,
                signal.fixture_id,
                serde_json::to_string(signal)?,
                signal.created_at
            ],
        )?;
        Ok(())
    }

    pub fn insert_agent_decision(
        &self,
        run_id: &str,
        decision: &crate::domain::agent::AgentDecision,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "
            INSERT INTO agent_decisions (id, run_id, signal_id, action, decision_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(id) DO UPDATE SET decision_json = excluded.decision_json
            ",
            rusqlite::params![
                decision.id,
                run_id,
                decision.signal_id,
                format!("{:?}", decision.action),
                serde_json::to_string(decision)?,
                decision.created_at
            ],
        )?;
        Ok(())
    }
}
```

## Evaluation Loop

Evaluation means comparing a signal against later live events. It is not model
training. It is product accountability.

Examples:

- A `SharpOddsMove` signal is useful if a later odds event confirms continued
  movement or the market closes in the signaled direction.
- A `ScoreEvent` signal is useful if later score state matches the event and the
  proof gate eventually passes.
- A `TriggerResolution` decision is useful only if txoracle proof passed and the
  event was actually final/resolved.
- A blocked decision is useful if the missing proof later remains missing or
  fails validation.

```rust
// src-tauri/src/services/agent/evaluation.rs

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
    let relevant = later_events
        .iter()
        .filter(|event| event.id != decision.signal_id)
        .collect::<Vec<_>>();

    let proof_passed_later = relevant.iter().any(|event| {
        event.proof
            .as_ref()
            .map(|proof| matches!(proof.simulation_status, ValidationSimulationStatus::Passed))
            .unwrap_or(false)
    });

    let final_seen = relevant
        .iter()
        .any(|event| matches!(event.kind, TxLineEventKind::FinalWhistle));

    match decision.action {
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
        AgentAction::Watch | AgentAction::Notify | AgentAction::SimulatePosition => None,
        _ => None,
    }
}
```

## UI Contract

The frontend should show the real execution pipeline:

```text
Observation -> Features -> Signal -> Proof -> LLM_USED/FALLBACK -> Decision -> Action -> Evaluation
```

The existing `AgentTracePanel` can render this without a full redesign if the
runtime emits `AgentTracePhase` events consistently:

- `Observe`: sanitized `TxLineEvent` summary.
- `Derive`: `MarketFeatures`.
- `ToolCall`: proof/notification/simulation request.
- `ToolResult`: proof receipt, notification result, simulation artifact.
- `LlmReasoning`: provider/model/used boolean and explanation, no secrets.
- `Decision`: `AgentDecision` and policy checks.
- `Action`: local action result.
- `Evaluation`: later result or queued state.

The UI should not need raw TxLINE payloads to explain the agent. Raw payloads
can remain in the operator page for diagnostics.

## Test Plan

Add focused Rust tests. Do not rely on live TxLINE or live Venice for unit tests.

```rust
#[test]
fn missing_proof_cannot_trigger_resolution() {
    let context = test_context(TrackMode::Settlement, TxLineEventKind::FinalWhistle);
    let features = MarketFeatures {
        severity_score: 0.9,
        actionability_score: 0.4,
        proof_present: false,
        root_present: false,
        txoracle_passed: false,
        ..MarketFeatures::default()
    };
    let signal = build_signal(&context, &features).expect("signal");
    let gate = ProofGateDecision {
        pass: false,
        reason: "proof payload missing".to_string(),
        checked: vec![],
    };

    let decision = policy::choose_action(
        &context,
        &signal,
        &features,
        Some(&gate),
        "proof missing".to_string(),
    );

    assert_eq!(decision.action, AgentAction::FetchProof);
    assert!(matches!(decision.execution_status, ExecutionStatus::Pending));
}

#[test]
fn low_severity_context_event_does_not_emit_signal() {
    let context = test_context(TrackMode::Fan, TxLineEventKind::Fixture);
    let features = MarketFeatures {
        severity_score: 0.3,
        actionability_score: 0.1,
        ..MarketFeatures::default()
    };

    assert!(build_signal(&context, &features).is_none());
}

#[tokio::test]
async fn venice_missing_key_uses_deterministic_fallback() {
    let config = test_config_without_venice_key();
    let client = VeniceClient::new(reqwest::Client::new());
    let response = client
        .complete(
            &config,
            LlmRequest {
                system: "Explain facts only".to_string(),
                user: "{}".to_string(),
                model: "default".to_string(),
                max_tokens: 300,
                temperature: 0.2,
            },
        )
        .await
        .expect("fallback");

    assert!(!response.used);
    assert_eq!(response.provider, "none");
}
```

End-to-end desktop checks:

```powershell
npm run lint:types
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
npm run tauri:build
```

Sidecar checks:

```powershell
node --check runtime/sidecars/txoracle-validation-bridge.mjs
node --check runtime/sidecars/coralos-bridge.mjs
node --check runtime/sidecars/yellowstone-bridge.mjs
```

## Security And Trust Rules

- Treat TxLINE SSE data, txoracle account data, and RPC responses as untrusted.
- Validate fixture id, sequence, stat keys, root presence, proof presence, and
  simulation result before marking proof as passed.
- Keep `ValidationSimulationStatus::NotStarted` and `Unavailable` as non-pass.
- Never place `TXLINE_GUEST_JWT`, `TXLINE_API_TOKEN`, `VENICE_API_KEY`, Triton
  tokens, or keypair paths in frontend events, prompts, logs, or JSONL exports.
- Never sign or send transactions from this agent loop.
- If future wallet/settlement flows are added, they need explicit user approval,
  simulation, transaction summary, and cluster display before signing.
- The LLM can phrase a decision but cannot produce the decision.
- Raw payloads should be bounded before entering prompts or UI traces.

## Migration Sequence

1. Add `services::llm` with Venice fallback behavior.
2. Add `services::agent::{context,features,policy,tools,evaluation}`.
3. Add structured ledger tables and insert helpers.
4. Replace `run_agent_round` internals with
   `run_match_intelligence_round`, keeping the Tauri command shape stable.
5. Emit `AgentTracePhase::LlmReasoning`, `Decision`, `Action`, and
   `Evaluation` from the real runtime.
6. Keep `services::coral::market` as fallback until the UI no longer depends on
   bid/winner fields.
7. Add optional backend auto-trigger from live TxLINE events with bounded
   channel/backpressure.
8. Update the UI copy and panels so "agent trace" means actual runtime steps.
9. Expand tests around proof gates, policy decisions, Venice fallback, and
   ledger persistence.
10. Remove old buyer/seller/verifier mental model from product surfaces once
    parity is reached.

## Definition Of Done

The implementation is done when:

- Done: A live TxLINE event can produce an agent run without calling
  `coral::market::run_round`.
- Done: The run contains deterministic features, optional signal, policy
  checks, decision, and action result when thresholds are met.
- Done: Settlement/resolution actions cannot pass unless the txoracle proof
  gate returns `Passed`.
- Done: Venice is optional and records `used: false` when not configured.
- Done: The UI receives a real trace in event order, not an after-the-fact
  script.
- Done: SQLite can answer what the agent saw, why it acted, what proof it had,
  and whether the LLM contributed text.
- Staged: later correctness evaluation is queued now and will score against
  future live TxLINE updates as the fixture timeline fills in.
