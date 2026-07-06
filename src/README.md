# src

React frontend source for the Tauri webview lives here.

## Directories

- `app/`: webview orchestrator, global chrome, and navigation.
- `core/`: pure TypeScript contracts, deterministic helpers, and browser-dev fallbacks.
- `desktop/`: the Tauri IPC and native event boundary.
- `features/consumer/`: Pulse Rooms UI.
- `features/web3/`: Verified Markets, settlement, and proof UI.
- `features/agent/`: Match Intelligence Agent UI.
- `features/operator/`: raw feed, fixture board, and internal demo panels.

## Rules

- Production desktop behavior should call Rust through `desktop/transport.ts`.
- Browser-only direct network paths are allowed only as development fallbacks.
- Secrets must never be imported, rendered, or bundled into frontend code.
- Feature components should consume typed events and commands, not raw TxLINE, Triton, or Yellowstone clients.
