# src/core/coral

Deterministic Coral-adjacent helpers shared by the desktop UI.

The active runtime for rounds is Rust (`src-tauri/src/services/coral/` plus the
CoralOS/agent services). This directory may contain pure scoring/display helpers,
but it must not contain browser-local round execution or placeholder settlement
flows.

## Files

- `agents.ts`: loads agent metadata through native Rust IPC.
- `scoring.ts`: frontend mirror of deterministic bid scoring for display.

## Rules

- Keep this directory aligned with `src-tauri/src/services/coral/`.
- Do not add browser data paths, secret handling, or settlement authority here.
