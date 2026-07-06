# docs/architecture

Architecture notes describe how the Tauri desktop app is structured and why responsibilities are split between Rust, React, feature engines, sidecars, TxLINE, and Solana/Triton integrations.

## Files

- `01-lean-e2e-architecture.md`: active lean-track plan and current E2E UI/repo status.
- `compartments.md`: current source ownership boundaries.
- `full-tauri-app-plan.md`: historical full-native migration plan, kept for context.
- `rust-agents-plan.md`: superseded multi-role agent plan, kept for history.

## Rules

- Put system-level decisions here before scattering them through code comments.
- Keep this directory implementation-aware but not secret-aware: describe config names, never real config values.
