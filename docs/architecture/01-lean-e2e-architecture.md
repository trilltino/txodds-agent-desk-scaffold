# World Cup Pulse Desk - E2E Lean Track Plan (integrated)

**Repo:** `trilltino/txodds-agent-desk-scaffold`
**Status:** ACTIVE - this document supersedes `rust-agents-plan.md` (six-role LLM market) per
[ADR 0006](../adr/0006-lean-agent-runtime-no-agent-theatre.md).
**Purpose:** one idiomatic, documented, modular codebase supporting three TxLINE hackathon
submissions without agent theatre: keep one shared TxLINE/event/proof core, build three
end-to-end products, and replace the buyer/seller/verifier/arbiter role-play layer with one
real autonomous **Match Intelligence Agent**.

| Track | Product | Runtime shape | What judges see |
| --- | --- | --- | --- |
| Consumer | **Pulse Rooms** | Deterministic room engine + optional narration helper | A live social World Cup room with leaderboard, pulse cards, TTS, and share cards. |
| Web3 / Platform | **Verified Prediction Markets & Resolution Engine** | Deterministic market/proof/settlement services | A fixture-bound market resolving from TxLINE validation data and Solana/devnet proof state. |
| Agent | **Match Intelligence Agent** | One autonomous Rust agent loop with internal policy modules | A running tool that watches TxLINE, detects signals, acts, and scores its own performance. |

```text
TxLINE event -> normalized event bus -> Consumer room engine
                                     -> Web3 market/proof engine
                                     -> Agent intelligence runtime
```

Only the intelligence runtime is called an *agent*. Everything else is a service, engine,
detector, policy, resolver, keeper, or UI feature:

```text
Agent    = autonomous runtime that observes, decides, acts, and evaluates.
Service  = async/backend side-effect unit.
Engine   = deterministic business logic around a product surface.
Detector = pure signal extraction.
Policy   = deterministic gating logic.
Resolver = deterministic proof/settlement state transition.
Narrator = explanation/copy generator, optional LLM-backed.
```

---

## 0. E2E UI update - repo status as of 2026-07-06

The original plan was written before the live-data pass landed. The following are **already
true in this repo** and the plan below builds on them rather than re-specifying them:

- **Live TxLINE, no mock on the product path.** `just txline-onboard`
  (`tooling/txline-onboard.mjs`) mints real free-tier credentials end-to-end (guest JWT ->
  free on-chain `subscribe` -> signed activation -> API token -> `.env`). Native mode starts
  `start_txline('live')` unconditionally; missing credentials surface as a
  `credentials_required` ingest status, never a silent mock fallback. Live SSE reconnects
  resume via `Last-Event-ID`, and every live event is auto-recorded to replay JSONL -
  that recording is the seed for the PR 2 replay harness.
- **Live fixtures board.** `FixtureBoard` (operator feature) lists real
  `/api/fixtures/snapshot` fixtures for today's epoch day; selecting one pulls odds/scores
  snapshots and stages them as a normalized trigger event. TxLINE payloads are PascalCase
  (`FixtureId`, `Participant1/2`, `StartTime` epoch-ms) - parsers in `core/txline/fixtures.ts`.
- **Yellowstone watches the txoracle program.** The chain service auto-runs
  `watch_program(txline_program_id())` at startup, so TxLINE proof roots landing on-chain
  stream in as `chain://tx` events - the `proof_ready` detector input for the agent runtime.
- **Deadline context:** TxODDS free World Cup access ends **2026-07-19**. Record replays
  during real matches before then; after the final, demos run on real recorded data.

### Executed in the restructure pass (2026-07-06)

**PR 0 (renames/demotions) and the structural half of PR 1 are DONE:**

- Frontend moved to the `app/ core/ features/ desktop/` layout (section 3), components renamed,
  nav relabeled to `Pulse Rooms | Verified Markets | Intelligence Agent`.
- Backend split into `commands/ services/ domain/ event_bus state` (section 4); `lib.rs` is a
  composition root only; every module carries `//!` docs.
- Event names live in exactly two mirrored constant tables:
  `src-tauri/src/event_bus.rs` <-> `src/desktop/events.ts`.
- Domain contracts for rooms/markets/proof/agent are staged in both languages
  (`src-tauri/src/domain/*` <-> `src/core/*/types.ts`).
- `coral-agents/*` manifests archived to `docs/legacy-coral-agents/`; the deterministic
  Coral round engine survives as `services/coral` (documented as legacy) behind
  `run_agent_round` until PR 5 replaces it.

**Two deliberate deviations from the original plan:**

1. **Tabs, not routes (yet).** The UI keeps the single-page track-tab model; `TrackMode`
   values (`settlement | trading | fan`) are serialized by Rust and SQLite, so only the
   *labels* changed. The `/consumer /web3 /agent /operator` router of section 13 arrives with the
   track screens themselves (PR 3-5), where per-route state earns the dependency.
2. **Operator feature exists now.** `RawTxLineFeed`, `FixtureBoard`, and `TrackScorecard`
   already form `features/operator/` because the live-data pass produced real operator
   surfaces ahead of schedule.

---

## 1. Agent-pruning matrix

| Previous role | Runtime agent? | Replacement | Reason |
| --- | ---: | --- | --- |
| `worldcup-buyer-agent` | No | `intelligence_agent/policy.rs` / `market_engine/factory.rs` | The product chooses actions from policy; no buyer awarding sellers. |
| `seller-worldcup-edge` | No | `intelligence_agent/detectors.rs`, `core/txline/probability.ts` | Fair-line/odds-move detection is deterministic, testable math. |
| `seller-risk-policy` | No | `intelligence_agent/risk.rs` | Risk gating is a policy module, not an LLM persona. |
| `seller-fan-card` | No | `room_engine/pulse_cards.rs`, consumer `punditCopy.ts` | Fan cards are a consumer feature; optional LLM copy is not an agent. |
| `verifier-agent` | No | `market_engine/proof_gate.rs` | Verification verdicts must be code-only and auditable. |
| `settlement-arbiter-agent` | No | `market_engine/resolver.rs`, settlement service | Never let LLMs arbitrate money or state. |
| `match-intelligence-agent` | **Yes** | `services/intelligence_agent/runtime.rs` | The one autonomous agent for the Agent track. |

Archived manifests: `docs/legacy-coral-agents/`. Active legacy engine: `services/coral`
(deterministic; feeds `run_agent_round` until PR 5).

---

## 2. Frontend layout (section 3 of original) - EXECUTED

```text
src/
  app/                      # orchestrator + chrome
    App.tsx
    navigation/{Shell.tsx, ChainStatus.tsx}
  core/                     # pure, network-free logic + contracts
    txline/{client,events,fixtures,mock}.ts
    rooms/types.ts  markets/types.ts  proof/types.ts  agent/types.ts
    chain/client.ts
    coral/                  # legacy browser-dev fallback round
  features/
    consumer/components/PulseRoomScreen.tsx
    web3/components/{SettlementScreen,ProofDrawer}.tsx
    agent/components/IntelligenceAgentScreen.tsx
    operator/components/{RawTxLineFeed,FixtureBoard,TrackScorecard}.tsx
  desktop/{transport.ts, events.ts}
  types.ts                  # shared run/event contracts mirrored by Rust types.rs
```

Rename map (applied):

```text
FanMode.tsx        -> features/consumer/components/PulseRoomScreen.tsx
SettlementLab.tsx  -> features/web3/components/SettlementScreen.tsx
ProofPanel.tsx     -> features/web3/components/ProofDrawer.tsx
AgentArena.tsx     -> features/agent/components/IntelligenceAgentScreen.tsx
LiveFeed.tsx       -> features/operator/components/RawTxLineFeed.tsx
FixtureBoard.tsx   -> features/operator/components/FixtureBoard.tsx   (new since original plan)
TrackScorecard.tsx -> features/operator/components/TrackScorecard.tsx
Shell/ChainStatus  -> app/navigation/
src/domain/*       -> src/core/*  (triton -> chain)
```

Planned per-track additions (PR 3-5) keep the original component lists:
consumer `CreateRoomPanel/JoinRoomPanel/RoomLeaderboard/PulseTimeline/PulseCard/AudioPunditButton/ShareCard`
+ `domain/{roomLifecycle,roomScoring,pulseDetector,punditCopy,shareCard}.ts` + hooks;
web3 `MarketFactoryScreen/MarketCard/VerifiedReceipt` + `domain/{marketFactory,resolution,proofReceipt,predicates}.ts` + hooks;
agent `SignalFeed/AgentDecisionCard/AccuracyTracker/RuntimeControls/DecisionTimeline`
+ `domain/{signalDetection,actionPolicy,evaluation}.ts` + hooks.

No React component talks directly to TxLINE, Solana RPC, CoralOS, or Yellowstone: components
listen to typed events (`desktop/events.ts`) and call thin commands (`desktop/transport.ts`).

---

## 3. Backend layout (section 4 of original) - EXECUTED (engines pending)

```text
src-tauri/src/
  lib.rs                    # builder + command registration only        [done]
  state.rs                  # DesktopState, clients, handles, dirs      [done]
  event_bus.rs              # single table of native event topics       [done]
  config.rs error.rs types.rs web.rs
  commands/                 # thin IPC adapters                          [done]
    {config, txline, chain, intelligence, settlement, exports}.rs
    rooms.rs markets.rs proof.rs                                        [PR 3-4]
  domain/                   # staged deterministic contracts             [done]
    {rooms, markets, proof, agent}.rs
  services/
    txline/{api, ingest}.rs                                             [done, live]
    chain/{rpc, yellowstone}.rs                                         [done, live]
    ledger/store.rs                                                     [done]
    solana_pay/                                                         [done]
    coral/{agents, market, settlement}.rs   # legacy engine + bridge    [done, demoted]
    room_engine/{store, scoring, pulse_cards, narration}.rs             [PR 3]
    market_engine/{store, factory, resolver, proof_gate, settlement}.rs [PR 4]
    intelligence_agent/{runtime, context, detectors, policy,
                        actions, evaluator, trace}.rs                   [PR 5]
    llm/{complete, guard, explain}.rs                                   [PR 6]
```

Rust conventions enforced throughout: `//!` module docs stating responsibility and
boundaries; services own I/O, engines stay deterministic and unit-testable; commands are
glue only; event topics come from `event_bus`; secrets never cross IPC.

---

## 4. Shared event contract

Emitted today (constants in `event_bus.rs` <-> `events.ts`):

```text
txline://event   ingest://status   chain://slot   chain://account   chain://tx
pay://intent     pay://status      settle://receipt   market://round   app://notification
```

Reserved for the engines (add to both tables when first emitted):

```text
consumer://room-updated   consumer://pulse-card
web3://market-updated     web3://proof-receipt
agent://runtime-status    agent://signal   agent://decision
agent://execution         agent://evaluation
```

Domain types for the reserved topics are already defined in
`src-tauri/src/domain/{rooms,markets,proof,agent}.rs` and `src/core/*/types.ts`:
`PulseRoom`, `PulseCard`, `PredictionMarket`, `VerificationReceipt`, `AgentSignal`,
`AgentDecision`, `AgentMetrics` - field-for-field mirrors, camelCase over the wire.

---

## 5. E2E model: one replay drives all three tracks

Canonical replay: `fixtures/replays/worldcup-e2e.jsonl` (PR 2). Live sessions already
append real events to app-data `replays/*.jsonl` - promote a strong recorded match (before
July 19!) into the canonical fixture instead of hand-writing one.

| Step | Replay event | Consumer | Web3 | Agent |
| ---: | --- | --- | --- | --- |
| 1 | fixture opened | Room can be created | Market can be created | Fixture enters watchlist |
| 2 | odds baseline | Baseline probability | Market price context | Baseline window stored |
| 3 | odds move +9pts | Pulse card explains move | - | `sharp_odds_move` signal |
| 4 | goal | Leaderboard changes | - | Evaluation candidate |
| 5 | red card | Pulse card + delta | - | `red_card_reprice` signal |
| 6 | half-time | Room recap | Market locked | First-half summary |
| 7 | final whistle | Final leaderboard | Resolver starts | May trigger proof fetch |
| 8 | stat-validation | Verified badge | Proof gate runs | Prior calls evaluated |
| 9 | settlement receipt | Optional badge | Market resolved | Metrics updated |

Command targets (PR 2): `just e2e-consumer`, `just e2e-web3`, `just e2e-agent`,
`just e2e-all` (clears demo state, seeds fixture, starts app in replay mode, publishes at
demo speed, writes artifacts under `artifacts/demo-runs/<timestamp>/`).

---

## 6. Track E2E flows

### Consumer - Pulse Rooms (PR 3)

```text
create_pulse_room(fixture_id, room_name, mode) -> PulseRoom
join_pulse_room(room_id, display_name)         -> RoomMember
submit_room_pick(room_id, member_id, pick)     -> RoomPick
get_pulse_room / list_pulse_rooms / export_pulse_card
```

Engine: `room_engine/store.rs` (rooms/picks/leaderboard), `scoring.rs` (goal, red-card,
odds-move, final-whistle deltas), `pulse_cards.rs` (fan-relevance + before/after implied
probability), `narration.rs` (deterministic copy first, optional LLM polish, never blocks
scoring). Acceptance: replay-driven room updates with zero live credentials; no money
anywhere in consumer mode.

### Web3 - Verified Markets (PR 4)

```text
create_market(fixture_id, rule, outcomes, escrow_mode) -> PredictionMarket
lock_market(market_id)                                 -> PredictionMarket
fetch_stat_validation(fixture_id, seq, stat_key)       -> payload
validate_market_result(market_id)                      -> VerificationReceipt
settle_market(market_id)                               -> SettlementReceipt
```

Engine: `factory.rs` (templates, machine-readable rules), `resolver.rs` (watches
final-whistle/proof events), `proof_gate.rs` (code-only: fixture binding, stat-key binding,
predicate, Merkle presence, optional validate_stat simulation), `settlement.rs`
(simulated/devnet only; **no LLM in the settlement path**; settlement blocked unless the
proof gate passes). The existing Solana Pay + Triton observation rail is reused as-is.

### Agent - Match Intelligence (PR 5)

```text
start_intelligence_agent(config) / stop / status
list_agent_signals(fixture_id?)   list_agent_decisions(signal_id?)
get_agent_metrics()               run_intelligence_step(event_id)   # debug only
run_agent_round(trigger, track)   # deprecated shim -> run_intelligence_step
```

Modules: `runtime.rs` (tokio loop subscribed to txline://event), `context.rs` (rolling
odds/score windows), `detectors.rs` (sharp move, red-card reprice, late shift, proof-ready
- fed by the existing txoracle `chain://tx` watch), `policy.rs` (thresholds, caps, blocked
reasons), `actions.rs` (notify / simulate position / fetch proof / trigger resolution),
`evaluator.rs` (correct/incorrect/expired + metrics), `trace.rs` (decision trace, optional
LLM explanation).

Deterministic signal formula (documented + unit-tested):

```text
move_points = |1/decimal_after - 1/decimal_before| * 100
sharp_odds_move if move_points >= threshold and score unchanged within grace window
```

### LLM (PR 6): helper only

`services/llm/{complete,guard,explain}.rs` - the Venice/OpenAI-compatible `complete()`
port (env: `LLM_PROVIDER=venice`, `VENICE_API_KEY` set, `LLM_MODEL=kimi-k2-7-code`,
Kimi >=1024 max_tokens floor), strict-JSON guard, deterministic fallback, `LLM_USED` audit.
Allowed: fan-card wording, decision explanations, signal summaries, receipt copy.
Never: resolution verdicts, settlement, escrow, predicate pass/fail.

---

## 7. Persistence

SQLite (existing `services/ledger`) grows tables per engine PR:

```text
rooms  room_members  room_picks  pulse_cards            [PR 3]
markets  market_outcomes  verification_receipts         [PR 4]
agent_signals  agent_decisions  agent_executions
agent_evaluations                                       [PR 5]
txline_events  replay_runs  llm_audit                   [PR 2/6]
```

Every E2E state transition is persisted so demos can be reviewed after the fact.

---

## 8. PR plan and status

| PR | Scope | Status |
| --- | --- | --- |
| 0 | Renames, coral demotion, ADR 0006, README repositioning | **DONE (this pass)** |
| 1 | Event bus + domain contracts (both languages) | **DONE (this pass)** - `NormalizedTxLineEvent` widening (seq/matchClock/stats) rides with PR 2 |
| 2 | Replay-driven E2E harness + `just e2e-*` + replay_runs ledger | next |
| 3 | Consumer Pulse Rooms engine + UI | pending |
| 4 | Web3 verified markets + proof gate + receipts | pending |
| 5 | Match Intelligence Agent runtime + UI; `run_agent_round` becomes shim | pending |
| 6 | LLM explanation helper + LLM_USED audit | pending |
| 7 | Track docs, runbooks, demo scripts, submission packaging | pending |

Global "done" (`just e2e-all` passes): one replay emits normalized events; the room updates
from them; the market resolves from them; the agent emits and evaluates at least one
signal; everything lands in SQLite; artifacts are written per run.

---

## 9. Documentation tree (PR 7 fills the gaps)

```text
docs/
  architecture/01-lean-e2e-architecture.md   (this file)
  architecture/rust-agents-plan.md           (SUPERSEDED, kept for history)
  adr/0006-lean-agent-runtime-no-agent-theatre.md
  legacy-coral-agents/                       (archived manifests)
  tracks/{consumer-pulse-rooms, web3-verified-markets, agent-match-intelligence}.md
  runbooks/{local-dev, replay-mode, e2e-*, txline-credentials, devnet-settlement}.md
  submission/*
```

README positioning: **World Cup Pulse Desk** - TxLINE live World Cup scores, odds, events,
and Solana-anchored validation data powering three products off one normalized event bus:
Pulse Rooms (consumer), Verified Markets (web3), and one autonomous Match Intelligence
Agent. Avoid the old scaffold labels (Fan Mode / Settlement Lab / Agent Arena) everywhere.
