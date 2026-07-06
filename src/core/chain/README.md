# src/core/chain

Typed chain contracts and desktop-only helper wrappers.

## Files

- `client.ts`: forwards Solana/Triton reads to Rust IPC and fails closed outside
  the Tauri desktop runtime.

## Rules

- Triton calls belong in Rust under `src-tauri/src/services/chain/`.
- Tokens must never be exposed to this directory.
- Keep method allowlists aligned with Rust's `chain_rpc` command.
