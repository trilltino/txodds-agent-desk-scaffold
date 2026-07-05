# World Cup Agent Desk — Tauri scaffold for TxODDS / TxLINE

A desktop command centre that combines all three Superteam World Cup tracks in one coherent product:

> **TxLINE event → agent round → verifier/proof → Solana settlement → Triton-observed chain state → fan/trader/market UI.**

This scaffold is designed to be dropped into `examples/txodds-agent-desk` inside `trilltino/solana_coralOS`, or run as a standalone Tauri app while calling the existing repo for escrow/market logic.

## Why this product works

The app is not a sportsbook. It is a **World Cup sports-intelligence and settlement console**:

- **Settlement Lab**: create/devnet-resolve outcome markets using TxLINE scores/proofs.
- **Signal Arena**: autonomous agents detect odds movement, risk-score it, and log strategy decisions.
- **Fan Mode**: a mainstream AI pundit card explains goals, red cards, and odds shifts in plain English.
- **Proof Panel**: shows TxLINE input, delivery hash, verifier verdict, escrow status, Explorer link, and Triton observation.

## Run

```bash
npm install
cp .env.example .env
npm run tauri:dev
```

With no credentials, the app runs against mock data so your demo video has a safe fallback. Add `TXLINE_GUEST_JWT` and `TXLINE_API_TOKEN` to enable live TxLINE calls.

## Desktop architecture

This is an end-to-end Tauri desktop app, not a browser-only web app:

- Tauri owns the native window, app identity, installer bundle, icon set, capabilities, notifications, and OS app-data storage.
- Rust owns secrets, TxLINE ingestion, Triton RPC calls, run persistence, hash/reference generation, market-round execution, and native file export.
- React/HTML/CSS/JavaScript remains the frontend renderer inside the Tauri webview.
- In packaged/native mode, production network calls go through Rust commands and events. The webview does not receive Triton or TxLINE tokens.
- Plain `npm run dev` remains useful for browser-only UI iteration, but `npm run tauri:dev` and `npm run tauri:build` are the desktop product paths.

## Live Yellowstone + CoralOS wiring

Yellowstone gRPC runs as a Rust-managed backend sidecar using Triton's official `@triton-one/yellowstone-grpc` SDK. Set:

```bash
TRITON_GRPC_ENDPOINT=https://your-endpoint.rpcpool.com:443
TRITON_X_TOKEN=...
WATCH_ESCROW_PROGRAM_ID=...
WATCH_MARKET_PROGRAM_ID=...
```

CoralOS settlement runs through `sidecars/coralos-bridge.mjs`. It prefers `CORALOS_BRIDGE_URL` if you provide a custom bridge matching `docs/integration-with-solana-coralos.md`; otherwise it calls the existing TxODDS proxy `/api/settle` from `trilltino/solana_coralOS`.

```bash
CORALOS_ROOT=C:\path\to\solana_coralOS
CORALOS_TXODDS_PROXY=http://localhost:8801
CORALOS_AUTOSTART_PROXY=1
CORALOS_SETTLEMENT_ENABLED=1
```

The sidecars run outside the webview. Tokens, keypairs, proxy credentials, and settlement operations stay in Rust/Node backend processes.

## Current E2E wiring

The desktop app now has live backend integration surfaces instead of browser-only placeholders:

- `src-tauri/src/yellowstone.rs` starts `sidecars/yellowstone-bridge.mjs` when `TRITON_GRPC_ENDPOINT` and `TRITON_X_TOKEN` are configured.
- The Yellowstone sidecar uses Triton's official `@triton-one/yellowstone-grpc` SDK pinned to the Windows-compatible `4.x` line and emits `chain://slot`, `chain://account`, and `chain://tx` through Rust.
- `watch_account`, `watch_program`, and `watch_reference` commands update live Yellowstone subscription filters from the desktop app.
- `src-tauri/src/settle.rs` sends completed agent runs to `sidecars/coralos-bridge.mjs` over newline-delimited JSON.
- The CoralOS bridge prefers a docs-style `CORALOS_BRIDGE_URL` with `/rounds` and `/settlement/:id/release`; otherwise it calls the existing TxODDS proxy `/api/settle`.
- `run_agent_round` attempts CoralOS settlement, emits `settle://receipt`, registers Yellowstone watches for the returned escrow/reference, observes through Triton RPC, and persists the run to SQLite.
- The Windows installer bundles the sidecar scripts, their Node module runtime dependencies, and `sidecars/bin/node.exe`; `NODE_BIN` can still override the bundled runtime.

## Legacy CoralOS source map

| Existing repo piece | Used here as |
|---|---|
| `examples/txodds/agent/txline.ts` | Production TxLINE client implementation to replace `src/lib/txline.ts` stubs. |
| `examples/txodds/agent/service.ts` | Agent delivery fork point. Add `case 'fan-card'`, `case 'signal'`, `case 'resolve-market'`. |
| `examples/research` | Event-driven odds-move trigger logic. |
| `packages/agent-runtime/src/market` | WANT/BID/AWARD wire protocol for real CoralOS rounds. |
| `packages/agent-runtime/src/ledger` | Durable run record: trigger, bids, award, delivery, verification, txs. |
| `packages/agent-runtime/src/policy` | Spend caps, service allowlist, verifier-gated release. |
| `examples/txodds/escrow` | Devnet escrow/arbiter settlement spine. |

## Original scaffold notes

These were the original scaffold tasks and are superseded by the current Rust/sidecar wiring above.

1. Keep this Tauri UI and mock agent round working.
2. Swap `src/lib/txline.ts` with your existing TxLINE client and SSE parser.
3. Wire `runLocalAgentRound()` to your CoralOS market: `WANT → BID → AWARD → DEPOSITED → DELIVERED → VERIFIED → RELEASED`.
4. Replace `createDevnetEscrowStub()` with your deployed escrow/arbiter calls.
5. Replace `watchEscrowWithTriton()` with Yellowstone gRPC account/transaction subscriptions.
6. Add TxLINE stat-validation receipts to Settlement Lab.

## App screens

- `LiveFeed`: real-time TxLINE event stream.
- `AgentArena`: bidding between sharp, risk, pundit, and settlement agents.
- `SettlementLab`: Track 1 market/proof/escrow state.
- `FanMode`: Track 3 mainstream fan-facing product.
- `ProofPanel`: judge-facing chain of evidence.
- `TrackScorecard`: shows why the same product fits all three tracks.
