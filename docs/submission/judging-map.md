# How the app maps to the TxODDS tracks

## Consumer: Pulse Rooms

### What judges ask for

- Mainstream accessible UX.
- Real-time responsiveness.
- Original fan interaction model.
- Commercial path.
- Complete end-to-end feature.

### How World Cup Pulse Desk hits it

- A live/replay TxLINE event becomes a consumer-readable Pulse Room moment.
- Goals, cards, and odds moves can produce fan cards and leaderboard changes.
- The operator can show the raw event behind the friendly card.
- The path stays money-free and safe for mainstream fan contexts.

### Demo line

"A TxLINE match event arrives; Pulse Rooms turns it into a shareable fan moment while preserving the raw data behind it."

## Web3 / Platform: Verified Markets

### What judges ask for

- Smooth TxLINE ingestion.
- Clear deterministic resolution and validation logic.
- Proof receipts and custom settlement/verification paths.
- Honest limits around money movement and validation.

### How World Cup Pulse Desk hits it

- TxLINE snapshot/SSE input is normalized by Rust and recorded.
- The proof drawer stores event input, verdict, settlement references, and chain observations.
- The tx-on-chain plan wires this to official txoracle IDLs, Merkle roots, and `/api/scores/stat-validation`.
- Solana Pay and Triton provide a concrete devnet receipt path while full proof gates land.

### Demo line

"A final or proof-ready TxLINE event resolves a fixture-bound market through a deterministic receipt, then the chain observer confirms the settlement reference."

## Agent: Match Intelligence Agent

### What judges ask for

- Autonomous operation.
- Clean mathematical or strategic logic.
- Novel sports tracking.
- Production readiness for a trading or intelligence workflow.

### How World Cup Pulse Desk hits it

- The active plan has one real autonomous runtime, not a fake buyer/seller debate.
- Detectors compute odds movement, score context, proof readiness, and policy gates.
- Decisions and evaluations are persisted to SQLite.
- LLMs are optional explanation helpers, not decision-makers.

### Demo line

"The odds stream moves; the Match Intelligence Agent detects the signal, records its features, chooses an action from policy, and later evaluates the outcome."
