# settlement-arbiter-agent

The settlement arbiter bridges verified runs to CoralOS settlement and Triton observation.

## Manifest

- `coral-agent.toml`: settlement identity, cluster preference, and release-gate defaults.

## Runtime Status

Settlement behavior currently lives in `src-tauri/src/coral/settlement.rs` and `runtime/sidecars/coralos-bridge.mjs`. This manifest documents the role that should eventually own those runtime constraints.
