# src-tauri/src

Rust backend modules implement the desktop app core.

## Files and Directories

- `main.rs`: Tauri binary entrypoint.
- `lib.rs`: app builder, managed state, Tauri commands, and event wiring.
- `config.rs`: environment/config loading.
- `error.rs`: IPC-safe error types.
- `types.rs`: shared backend data structures serialized to the webview.
- `web.rs`: optional loopback diagnostics/API service.
- `coral/`: market agents, state machine, and settlement bridge.
- `ledger/`: SQLite persistence.
- `triton/`: Solana JSON-RPC and Yellowstone observation.
- `txline/`: live TxLINE ingestion and documented data/proof API helpers.

## Rules

- Treat this as the production backend.
- Keep blocking work off the main Tauri thread.
- Emit typed events instead of making the webview poll privileged services.
