# src/core/txline

Browser-dev TxLINE helpers provide mock and fallback event utilities for UI iteration.

## Files

- `client.ts`: browser fallback client.
- `events.ts`: event normalization helpers.
- `fixtures.ts`: fixture snapshot shaping helpers.
- `mock.ts`: mock World Cup event fixtures.

## Rules

- Production TxLINE ingestion belongs in Rust under `src-tauri/src/services/txline/`.
- Keep event shapes compatible with `src-tauri/src/services/txline/ingest.rs`.
- Do not store guest JWTs or API tokens in frontend code.
