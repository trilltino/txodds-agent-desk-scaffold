# src-tauri/src/txline

TxLINE ingestion lives in the Rust backend.

## Files

- `ingest.rs`: live/mock/replay event generation and event emission.
- `mod.rs`: module exports.

## Rules

- Rust owns live TxLINE credentials and network calls.
- Mock and replay modes should emit the same event shape as live mode.
- Emit status events whenever ingestion connects, stops, or fails.
