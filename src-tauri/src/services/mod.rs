//! Backend services: async side-effect units behind the Tauri command layer.
//!
//! Naming follows the lean-track vocabulary (docs/architecture/01-lean-e2e-architecture.md):
//! a *service* owns I/O and supervision; deterministic business logic belongs in
//! engines/domain modules; only the future Match Intelligence runtime is an *agent*.
//!
//! - `txline`: TxLINE HTTP data client plus live/replay/mock ingest supervision.
//! - `chain`: Triton One integration - allowlisted JSON-RPC and the Yellowstone
//!   gRPC sidecar supervisor.
//! - `ledger`: SQLite persistence for runs, receipts, and payment intents.
//! - `solana_pay`: Solana Pay transfer-request creation and verification.
//! - `coral`: legacy Coral-style round engine and CoralOS settlement bridge,
//!   kept as the compatibility path until the Match Intelligence Agent lands
//!   (see docs/adr/0006-lean-agent-runtime-no-agent-theatre.md).

pub mod chain;
pub mod coral;
pub mod ledger;
pub mod solana_pay;
pub mod txline;
