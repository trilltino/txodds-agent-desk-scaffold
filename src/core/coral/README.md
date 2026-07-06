# src/core/coral

Browser-dev fallback code for the legacy Coral compatibility round lives here.

The active product vocabulary is Pulse Rooms, Verified Markets, and Match Intelligence Agent. This directory only keeps browser-only demos useful until the Rust Match Intelligence runtime replaces `run_agent_round`.

## Files

- `agents.ts`: fallback legacy Coral registry matching the Rust registry.
- `bidding.ts`: local bid generation for browser-only simulation.
- `scoring.ts`: local bid scoring rules.
- `localRound.ts`: local WANT -> BID -> AWARD -> DELIVERED -> VERIFIED flow.
- `settlement.ts`: local settlement-shape helpers for frontend display.

## Rules

- Keep this directory aligned with `src-tauri/src/services/coral/`.
- Do not add secret handling or real settlement authority here.
- Treat this as development fallback code, not the production engine.
