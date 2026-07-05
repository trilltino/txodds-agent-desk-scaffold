# docs/architecture

Architecture notes describe how the Tauri desktop app is structured and why responsibilities are split between Rust, React, Coral agents, sidecars, and Solana/Triton integrations.

## Files

- `compartments.md`: source ownership boundaries and how CoralOS-style compartments map into this repo.
- `full-tauri-app-plan.md`: end-to-end desktop implementation plan and current implementation status.

## Rules

- Put system-level decisions here before scattering them through code comments.
- Keep this directory implementation-aware but not secret-aware: describe config names, never real config values.
