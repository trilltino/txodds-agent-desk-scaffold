# World Cup Pulse Desk

World Cup Pulse Desk turns TxLINE live World Cup scores, odds, match events, and Solana-anchored validation data into three working products:

- **Pulse Rooms**: a consumer watch-party room surface for live cards, picks, leaderboards, and shareable moments.
- **Verified Markets**: a deterministic market-resolution and proof-receipt surface.
- **Match Intelligence Agent**: one autonomous sports intelligence runtime that observes events, decides, acts, and evaluates itself.

```text
TxLINE event -> normalized event bus -> Pulse Rooms
                                    -> Verified Markets
                                    -> Match Intelligence Agent
```

The app is a Tauri desktop product. Rust owns secrets, TxLINE ingestion, Triton RPC, Yellowstone observation, persistence, Solana Pay, and settlement/proof side effects. React renders the product surfaces and calls thin Tauri commands through `src/desktop/transport.ts`.

## Run

Install `just` once:

```powershell
winget install --id Casey.Just -e
```

Then use the project recipes:

```powershell
just setup
just desktop
```

Common recipes:

| Command | Purpose |
| --- | --- |
| `just desktop` | Start the native Tauri desktop app. |
| `just txline-onboard` | Mint free-tier TxLINE credentials into `.env`. |
| `just check` | Run TypeScript, Rust, and sidecar checks. |
| `just build` | Build webview assets and prepare sidecars. |
| `just tauri-build` | Build the packaged desktop app/installer. |

With `TXLINE_GUEST_JWT` and `TXLINE_API_TOKEN`, the desktop app starts live TxLINE odds and scores SSE streams from Rust. Missing credentials surface as a visible `credentials_required` ingest status. Direct browser preview and browser-owned data paths are intentionally blocked; TxLINE, Triton, Yellowstone, and txoracle validation stay Rust/sidecar-owned.

## Product Surfaces

The current UI keeps a single-page tab model while the track engines mature:

| Tab | Track | Current component |
| --- | --- | --- |
| Pulse Rooms | Consumer | `src/features/consumer/components/PulseRoomScreen.tsx` |
| Verified Markets | Web3 / Platform | `src/features/web3/components/SettlementScreen.tsx` and `ProofDrawer.tsx` |
| Intelligence Agent | Agent | `src/features/agent/components/IntelligenceAgentScreen.tsx` |
| Operator panels | Internal/demo support | `src/features/operator/components/*` |

The old scaffold labels are intentionally retired: `FanMode`, `SettlementLab`, `AgentArena`, `LiveFeed`, and `ProofPanel` have been renamed into the feature layout.

## Repository Layout

```text
src/
  app/                      # webview orchestrator and chrome
  core/                     # pure TS contracts and browser-dev fallback logic
  desktop/                  # Tauri IPC/event boundary
  features/
    consumer/               # Pulse Rooms
    web3/                   # Verified Markets and proof drawer
    agent/                  # Match Intelligence Agent UI
    operator/               # raw feed, fixture board, scorecard

src-tauri/src/
  lib.rs                    # composition root only
  commands/                 # thin Tauri IPC adapters
  domain/                   # staged deterministic Rust contracts
  services/
    txline/                 # TxLINE API, live/replay/mock ingest
    chain/                  # Triton RPC and Yellowstone sidecar supervision
    ledger/                 # SQLite persistence
    solana_pay/             # devnet Solana Pay intents
    coral/                  # legacy compatibility round engine/bridge
```

Module responsibilities are documented in `//!` headers on the Rust side and in local `README.md` files on the frontend side. Commands should stay glue-only; I/O belongs in services; deterministic business logic belongs in domain/engine modules.

## TxLINE And Chain Wiring

The desktop backend follows the current TxLINE OpenAPI source at `https://txline.txodds.com/docs/docs.yaml`.

- Auth/data credentials stay in Rust: `Authorization: Bearer <guest JWT>` and `X-Api-Token`.
- Live SSE uses `GET /api/odds/stream` and `GET /api/scores/stream` from `src-tauri/src/services/txline/ingest.rs`.
- Snapshot/proof commands cover fixtures, odds, scores, historical intervals, score history, and `/api/scores/stat-validation`.
- Generic `fetch_txline` is restricted to documented GET data/proof endpoints.
- Yellowstone watches the configured txoracle program so proof-root transactions can surface through `chain://tx`.

Triton and Yellowstone secrets remain in Rust-managed backend processes:

```bash
TRITON_GRPC_ENDPOINT=https://your-endpoint.rpcpool.com:443
TRITON_X_TOKEN=...
WATCH_ESCROW_PROGRAM_ID=...
WATCH_MARKET_PROGRAM_ID=...
```

## Legacy Coral Compatibility

The buyer/seller/verifier/arbiter Coral personas are no longer the active product model. They are archived under `docs/legacy-coral-agents/` and documented by [ADR 0006](docs/adr/0006-lean-agent-runtime-no-agent-theatre.md).

The deterministic compatibility implementation remains in `src-tauri/src/services/coral/` and `src/core/coral/` behind `run_agent_round` until the Match Intelligence Agent runtime replaces it. CoralOS settlement can still be reached through `runtime/sidecars/coralos-bridge.mjs` when configured:

```bash
CORALOS_ROOT=C:\path\to\solana_coralOS
CORALOS_TXODDS_PROXY=http://localhost:8801
CORALOS_AUTOSTART_PROXY=1
CORALOS_SETTLEMENT_ENABLED=1
```

## Documentation

Start here:

- [Lean E2E architecture](docs/architecture/01-lean-e2e-architecture.md)
- [txodds/tx-on-chain integration plan](docs/integrations/tx-on-chain-integration-plan.md)
- [ADR 0006: Lean agent runtime, no agent theatre](docs/adr/0006-lean-agent-runtime-no-agent-theatre.md)
- [Triton One integration](docs/integrations/triton-one.md)
- [CoralOS settlement bridge](docs/integrations/coralos-settlement.md)

## Done Means

The hackathon-ready shape is:

- one normalized TxLINE event bus
- a complete E2E flow per track
- replay mode for demos without live match activity
- SQLite records for every important state transition
- proof and settlement gates decided by deterministic code, not LLM output
- one real Match Intelligence Agent, not role-play agent theatre
