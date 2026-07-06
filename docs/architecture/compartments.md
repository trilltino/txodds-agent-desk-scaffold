# Compartments

This repo is now organized around the lean E2E plan: one shared TxLINE/event/proof core and three product tracks.

## Frontend Compartments

```text
src/
  app/          # webview orchestration and global chrome
  core/         # pure contracts, deterministic helpers, browser fallbacks
  desktop/      # Tauri IPC/event boundary
  features/
    consumer/   # Pulse Rooms
    web3/       # Verified Markets and proof UI
    agent/      # Match Intelligence Agent UI
    operator/   # raw feed, fixture board, debug panels
```

Rules:

- Feature components consume typed events and Tauri commands.
- `core/` stays network-free except browser-dev fallback helpers.
- Production credentials never enter React.

## Native Compartments

```text
src-tauri/src/
  lib.rs        # builder and command registration only
  commands/     # thin IPC adapters
  domain/       # deterministic Rust contracts for future engines
  services/     # async side-effect units
  event_bus.rs  # single native event-name table
  state.rs      # DesktopState and runtime handles
```

Rules:

- Commands validate input and delegate.
- Services own I/O, sidecars, credentials, persistence, and network clients.
- Domain modules hold deterministic contracts and, as engines land, pure business logic.
- Every Rust module should declare its boundary with a `//!` module doc.

## External Systems

| External system | Active local boundary |
| --- | --- |
| TxLINE API | `src-tauri/src/services/txline/` |
| TxODDS txoracle / Triton | `src-tauri/src/services/chain/` and `runtime/sidecars/yellowstone-bridge.mjs` |
| SQLite ledger | `src-tauri/src/services/ledger/` |
| Solana Pay | `src-tauri/src/services/solana_pay/` |
| CoralOS settlement bridge | `runtime/sidecars/coralos-bridge.mjs` plus `src-tauri/src/services/coral/settlement.rs` |

## Legacy Coral Archive

The old buyer/seller/verifier/arbiter manifests live under `docs/legacy-coral-agents/`.

`src-tauri/src/services/coral/` and `src/core/coral/` remain compatibility code behind `run_agent_round` until the Match Intelligence Agent runtime replaces them. They should not be expanded into new product-facing agent personas.
