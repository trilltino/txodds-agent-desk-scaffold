# How the app smashes all three TxODDS tracks

## Track 1 — Prediction Markets & Settlement

### What the judges ask for

- Smooth TxLINE ingestion.
- Intuitive user experience for soccer fans or analytical users.
- Clean deterministic resolution and validation logic.
- Bonus for Merkle/proof receipts and custom settlement engines.

### How World Cup Agent Desk hits it

- **Full-Tournament Auto-Market:** fixture scheduler can create market templates for all 104 matches.
- **Verifiable Resolution UI:** Proof Panel stores TxLINE receipt, stat/proof metadata, verifier verdict, delivery hash, escrow reference, and Explorer link.
- **Custom settlement spine:** reuse your existing Solana escrow/arbiter path, then upgrade to CPI into TxLINE `validate_stat` when ready.
- **Deterministic logic:** `settlement/verifier` does not ask the LLM to decide winners. It checks final score/stat predicate, proof, hash binding, and policy.

### Demo line

"A final-whistle TxLINE event resolves the market; the verifier checks the proof receipt; the escrow releases on devnet; Triton confirms the chain state."

## Track 2 — Trading Tools & Agents

### What the judges ask for

- Live/simulated TxLINE ingestion.
- Autonomous operation after deployment.
- Clean mathematical or strategic logic.
- Novel algorithmic sports tracking.
- Production readiness for a trading team or B2B intermediary.

### How World Cup Agent Desk hits it

- **Sharp Movement Detector:** odds updates are diffed; implied-probability moves above `ODDS_MOVE_TRIGGER_PCT` create a WANT automatically.
- **Agent vs Agent Arena:** sharp, contrarian/risk, and pundit agents compete; the buyer selects by confidence, price, ETA, and track fit.
- **No blind betting:** the MVP logs simulated actions and risk; it is legally safer and more credible.
- **Production angle:** strategy decisions create run ledgers and can be replayed even when no match is live.

### Demo line

"The odds stream moves; no human clicks anything; agents bid to analyze it; the system records the signal, risk, delivery hash, and optional simulated settlement."

## Track 3 — Consumer & Fan Experiences

### What the judges ask for

- Mainstream accessible UX.
- Real-time responsiveness.
- Original fan interaction model.
- Commercial path.
- Complete end-to-end feature.

### How World Cup Agent Desk hits it

- **AI Pundit Card:** every major event becomes an explanation a normal fan can understand.
- **Phone-in-hand UX:** the Tauri desktop is the judge/operator console; the same `FanMode` payload can be exported to Telegram, web, or TTS.
- **Originality:** not just a feed — it explains why the market moved and what the football event means.
- **Monetization:** premium alerts, B2B fan engagement widgets, paid signal packs, verified match receipts for communities.

### Demo line

"A goal arrives from TxLINE; the app instantly creates a shareable card explaining the event and odds movement in language fans understand."
