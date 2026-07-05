# src/domain/txline

Browser-dev TxLINE helpers provide mock and fallback event streams for UI iteration.

## Files

- `client.ts`: browser fallback client.
- `events.ts`: event normalization helpers.
- `mock.ts`: mock World Cup event fixtures.

## Rules

- Production TxLINE ingestion belongs in Rust.
- Keep event shapes compatible with `src-tauri/src/txline/ingest.rs`.
- Do not store guest JWTs or API tokens in frontend code.
