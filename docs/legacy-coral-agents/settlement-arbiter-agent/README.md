# settlement-arbiter-agent

The settlement arbiter bridges verified runs to CoralOS settlement and Triton observation.

## Manifest

- `coral-agent.toml`: settlement identity, cluster preference, and release-gate defaults.

## Runtime Status

Compatibility settlement behavior currently lives in `src-tauri/src/services/coral/settlement.rs` and `runtime/sidecars/coralos-bridge.mjs`. This manifest is historical; settlement constraints now belong to deterministic services and proof gates.
