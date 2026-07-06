# src/core/chain

Browser-dev chain helpers keep the frontend usable outside Tauri.

## Files

- `client.ts`: Vite proxy based JSON-RPC fallback used only when native Tauri IPC is unavailable.

## Rules

- Production Triton calls belong in Rust under `src-tauri/src/services/chain/`.
- Tokens must never be exposed to this directory.
- Keep method allowlists aligned with Rust's `chain_rpc` command.
