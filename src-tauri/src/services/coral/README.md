# src-tauri/src/services/coral

Legacy Coral compatibility lives here.

This module keeps the old deterministic WANT -> BID -> AWARD -> DELIVERED -> VERIFIED round available while the Match Intelligence Agent runtime is built. It is not the north-star product path; see `docs/adr/0006-lean-agent-runtime-no-agent-theatre.md`.

## Files

- `agents.rs`: built-in legacy Coral registry exposed through Tauri IPC.
- `market.rs`: deterministic compatibility market state machine.
- `settlement.rs`: CoralOS settlement sidecar bridge.
- `mod.rs`: module exports.

## Rules

- Keep decisions deterministic.
- Settlement must remain policy-gated and backend-only.
- Do not add new buyer/seller/verifier personas to the product path.
- Legacy manifests live under `docs/legacy-coral-agents/`.
