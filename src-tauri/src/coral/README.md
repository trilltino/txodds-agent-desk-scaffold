# src-tauri/src/coral

Native Coral market behavior lives here.

## Files

- `agents.rs`: built-in Coral agent registry exposed through Tauri IPC.
- `market.rs`: WANT -> BID -> AWARD -> DELIVERED -> VERIFIED market state machine.
- `settlement.rs`: CoralOS settlement sidecar bridge.
- `mod.rs`: module exports.

## Rules

- Keep market decisions deterministic unless an explicit LLM/runtime layer is added.
- Settlement must remain policy-gated and backend-only.
- Agent manifests under `coral-agents/` should eventually become the source of truth for this module.
