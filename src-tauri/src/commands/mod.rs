//! Tauri command layer: thin IPC adapters over services and engines.
//!
//! Commands validate input, borrow `DesktopState`, delegate to a service, and
//! emit typed events via `crate::event_bus`. Business logic does not live
//! here - a command that grows beyond glue belongs in a service or engine.
//!
//! - `config`: redacted public configuration.
//! - `txline`: ingest lifecycle plus the documented TxLINE data endpoints.
//! - `chain`: allowlisted Solana RPC, chain status, and Yellowstone watches.
//! - `intelligence`: agent-round execution and run history (legacy shim until
//!   the Match Intelligence runtime lands in PR 5).
//! - `settlement`: Solana Pay intent creation/verification.
//! - `exports`: hash receipts and fan-card file exports.

pub mod chain;
pub mod config;
pub mod exports;
pub mod intelligence;
pub mod settlement;
pub mod txline;
