//! Legacy Coral round engine and CoralOS settlement bridge.
//!
//! Kept as the compatibility path behind `run_agent_round` until the Match
//! Intelligence Agent replaces it (PR 5; see
//! docs/adr/0006-lean-agent-runtime-no-agent-theatre.md). New product code
//! should not grow here.

pub mod agents;
pub mod market;
pub mod settlement;
