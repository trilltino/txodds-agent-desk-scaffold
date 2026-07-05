# src/components

Components render the operator desk inside the Tauri webview.

## Component Roles

- `Shell.tsx`: global layout, navigation, and screen framing.
- `LiveFeed.tsx`: TxLINE event stream.
- `AgentArena.tsx`: Coral buyer/seller/verifier/settlement roster and bidding activity.
- `SettlementLab.tsx`: selected run, settlement, and chain observation state.
- `FanMode.tsx`: fan-facing output.
- `ProofPanel.tsx`: timeline and verification evidence.
- `ChainStatus.tsx`: Solana/Triton status strip.
- `TrackScorecard.tsx`: judging/track alignment.

## Rules

- Components should render state and invoke transport functions, not own backend protocols.
- Keep direct fetch/RPC calls out of components.
- Treat all backend and chain data as untrusted until normalized by Rust or typed frontend helpers.
