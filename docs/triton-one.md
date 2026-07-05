# Triton One integration plan

Triton is not the sports data provider. TxLINE is the sports data provider.

Triton is the Solana observer/execution layer that makes the proof panel feel professional.

## Where to use Triton endpoints

| App area | Triton endpoint/use | Why it matters |
|---|---|---|
| Settlement Lab | Yellowstone gRPC account subscriptions for escrow PDAs | Confirm deposit/release/refund without polling. |
| Proof Panel | Transaction subscription by escrow program / Solana Pay reference | Show slot/signature as soon as settlement happens. |
| Prediction Market Viewer | Stream market/AMM program accounts and vault balances | Live liquidity/volume dashboards. |
| Trading Agents | Watch on-chain position state, vaults, and settlement txs | Agents make decisions from reliable chain state. |
| Demo Replay | Historical archive / indexed transaction reads | Reproduce a reviewable demo after matches end. |

## Suggested env

```bash
TRITON_GRPC_ENDPOINT=https://...
TRITON_X_TOKEN=...
TRITON_RPC_HTTP=https://...
WATCH_ESCROW_PROGRAM_ID=...
WATCH_MARKET_PROGRAM_ID=...
```

## Adapter shape

```ts
interface ChainObserver {
  watchProgram(programId: string, onTx: (tx) => void): Promise<void>
  watchAccount(account: string, onUpdate: (u) => void): Promise<void>
  watchReference(reference: string, onSettlement: (s) => void): Promise<void>
}
```

## Concrete Yellowstone subscriptions

- `transactions`: filter for escrow/arbiter program IDs.
- `accounts`: watch escrow PDA, vault PDA, prediction-market accounts.
- `slots`: attach observed slot to the proof receipt.
- `blocks`: optional for replay/debugging.

## Product narrative

"TxLINE proves the match event. Triton proves the Solana settlement. The app displays both in one receipt."
