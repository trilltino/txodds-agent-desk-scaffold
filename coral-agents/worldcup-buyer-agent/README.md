# worldcup-buyer-agent

The buyer agent turns TxLINE triggers into market WANTs.

## Manifest

- `coral-agent.toml`: buyer identity, role, service name, and default bidding/verifier settings.

## Runtime Status

This manifest is currently mirrored by the Rust registry in `src-tauri/src/coral/agents.rs`. The next maturity step is to parse this manifest at runtime and drive buyer behavior from its configuration.
