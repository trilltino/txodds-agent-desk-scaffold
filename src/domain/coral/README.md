# src/domain/coral

Browser-dev Coral helpers keep the UI useful when it is run without the Tauri desktop backend.

## Files

- `agents.ts`: fallback Coral agent registry matching the Rust registry.
- `bidding.ts`: local bid generation for browser-only simulation.
- `scoring.ts`: local bid scoring rules.
- `localRound.ts`: local WANT -> BID -> AWARD -> DELIVERED -> VERIFIED flow.
- `settlement.ts`: local settlement-shape helpers for frontend display.

## Rules

- Keep this directory aligned with `src-tauri/src/coral/`.
- Do not add secret handling or real settlement authority here.
- Treat this as development fallback code, not the production engine.
