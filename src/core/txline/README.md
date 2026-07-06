# src/core/txline

TxLINE helpers normalize live payloads for the desktop app. Direct browser data
access is blocked; Rust owns TxLINE credentials and ingestion.

## Files

- `client.ts`: fail-closed browser boundary.
- `events.ts`: event normalization helpers.
- `fixtures.ts`: fixture snapshot shaping helpers.

## Rules

- Production TxLINE ingestion belongs in Rust under `src-tauri/src/services/txline/`.
- Keep event shapes compatible with `src-tauri/src/services/txline/ingest.rs`.
- Do not store guest JWTs or API tokens in frontend code.
