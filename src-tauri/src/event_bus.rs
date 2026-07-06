//! Typed native-event names: the single source of truth for `app.emit` topics.
//!
//! React subscribes to these exact strings through `src/desktop/events.ts`;
//! keeping both files as mirrored constant tables prevents topic-name drift
//! across the IPC boundary. Emit payload types live in `types.rs` so the wire
//! contract stays reviewable in one place.
//!
//! Reserved (not yet emitted) topics for the lean-track engines are listed at
//! the bottom; add the emitting service and the TypeScript constant in the same
//! change that first publishes them.

/// Normalized TxLINE event from live SSE, replay, or mock ingest.
pub const TXLINE_EVENT: &str = "txline://event";
/// Connection health for TxLINE ingest and the Yellowstone supervisor.
pub const INGEST_STATUS: &str = "ingest://status";
/// Chain heartbeat from Triton RPC polling or Yellowstone slot pushes.
pub const CHAIN_SLOT: &str = "chain://slot";
/// Watched-account updates streamed by the Yellowstone sidecar.
pub const CHAIN_ACCOUNT: &str = "chain://account";
/// Watched-program/reference transactions streamed by the Yellowstone sidecar.
pub const CHAIN_TX: &str = "chain://tx";
/// A Solana Pay transfer request was created for a run.
pub const PAY_INTENT: &str = "pay://intent";
/// A Solana Pay reference changed verification status.
pub const PAY_STATUS: &str = "pay://status";
/// Settlement receipt attached to a run (CoralOS, Solana Pay, or observation).
pub const SETTLE_RECEIPT: &str = "settle://receipt";
/// Phase-by-phase round timeline replay for UI animation.
pub const MARKET_ROUND: &str = "market://round";
/// App-internal notification payloads.
pub const APP_NOTIFICATION: &str = "app://notification";

// Reserved lean-track topics (see docs/architecture/01-lean-e2e-architecture.md section 5):
//   consumer://room-updated   consumer://pulse-card
//   web3://market-updated     web3://proof-receipt
//   agent://runtime-status    agent://signal
//   agent://decision          agent://execution      agent://evaluation
