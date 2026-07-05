# src-tauri

Rust/Tauri desktop backend source lives here.

## Contents

- `src/`: Rust backend modules and Tauri command/event wiring.
- `capabilities/`: Tauri permission surface for webview access.
- `icons/`: generated platform icons.
- `tauri.conf.json`: desktop window, bundle, resource, and CSP configuration.
- `Cargo.toml`: Rust dependency and package definition.

## Rules

- Rust owns secrets, native APIs, network integrations, persistence, settlement, and sidecar supervision.
- React receives typed results/events through IPC; it does not receive credentials or signing authority.
- Generated directories such as `target/` should not be committed.
