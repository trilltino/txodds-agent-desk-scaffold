# Product spec: World Cup Agent Desk

## One-line pitch

World Cup Agent Desk turns TxLINE's live World Cup feed into autonomous agent work: agents explain events, detect market moves, verify outcomes, and settle devnet escrows with an auditable proof trail.

## Core loop

1. TxLINE SSE emits an odds/scores event.
2. Trigger detector classifies it: goal, red card, final whistle, odds move, proof receipt.
3. Buyer agent posts a WANT.
4. Specialist agents bid: sharp movement, risk manager, AI pundit, settlement verifier.
5. Buyer selects best value.
6. Winner delivers a hash-bound artifact.
7. Verifier checks TxLINE input, artifact hash, proof availability, and policy.
8. Escrow releases/refunds.
9. Triton observer confirms on-chain state.
10. UI shows the complete evidence trail.

## MVP demo path

- Select mock/live event.
- Click `Run agent round`.
- Show bids and winner.
- Show generated signal/fan card/resolution package.
- Show verifier pass.
- Show escrow reference and Explorer placeholder.
- Show where Triton will observe the release transaction.
