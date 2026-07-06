//! Deterministic domain contracts for the three lean-track engines.
//!
//! These types are the Rust side of the shared event contract in
//! docs/architecture/01-lean-e2e-architecture.md section 6; the TypeScript mirrors
//! live under `src/core/{rooms,markets,proof,agent}/types.ts`. They are staged
//! ahead of their engines (room engine -> PR 3, market engine -> PR 4,
//! intelligence agent -> PR 5) so every PR builds against a reviewed contract
//! instead of inventing shapes inline.
//!
//! Shared TxLINE/run types remain in `crate::types` because live ingest,
//! ledger, and the legacy round engine already depend on them.

pub mod agent;
pub mod markets;
pub mod proof;
pub mod rooms;
