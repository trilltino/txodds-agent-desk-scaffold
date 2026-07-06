# Product Spec: World Cup Pulse Desk

## One-Line Pitch

World Cup Pulse Desk turns TxLINE live World Cup scores, odds, match events, and Solana-anchored validation data into three products powered by one normalized event bus: Pulse Rooms, Verified Markets, and one Match Intelligence Agent.

## Core Loop

1. TxLINE live/replay input produces a normalized event.
2. Rust persists and emits the event through the app event bus.
3. Pulse Rooms can turn the event into fan cards, room state, and leaderboard movement.
4. Verified Markets can use final/proof events to create a deterministic verification receipt.
5. The Match Intelligence Agent can detect signals, apply policy, act, and later evaluate whether the signal mattered.
6. Triton/Yellowstone and Solana Pay enrich receipts with chain-observed evidence.

## MVP Demo Path

- Start the desktop app.
- Select a live/replay fixture event.
- Show raw TxLINE input in the operator feed.
- Run the current compatibility round while the Match Intelligence runtime is staged.
- Show Pulse Rooms copy, Verified Markets settlement/proof state, and Intelligence Agent trace.
- Open the proof drawer to show TxLINE input, verdict, payment/settlement reference, and chain observation.

## Guardrails

- Consumer mode has no wagering or settlement flow.
- Web3 proof and settlement gates are deterministic and code-owned.
- LLM output, when added, may explain but may not decide proof, policy, or settlement.
- TxLINE, Triton, and settlement credentials never cross into the React webview.
