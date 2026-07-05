# Integration with `trilltino/solana_coralOS`

## Keep the Tauri app as the operator console

The desktop app does not need to replace your repo. It should visualize and trigger the existing loop.

```text
TxLINE stream
  -> Tauri Live Feed
  -> buyer WANT
  -> CoralOS agent market
  -> seller harness delivery
  -> verifier pass/fail
  -> Solana escrow release/refund
  -> Triton observer
  -> Tauri Proof Panel
```

## Minimal bridge

Add an HTTP/event bridge in your existing repo:

```text
examples/txodds-agent-desk/bridge
  GET  /events                 latest TxLINE events
  POST /rounds                 create WANT in CoralOS
  GET  /runs/:id               run ledger JSON
  GET  /runs/:id/transcript    transcript.jsonl
  POST /settlement/:id/release devnet release
```

The Tauri frontend calls the bridge. Your existing repo stays the source of truth for CoralOS, market, escrow, policy, and ledger.

## `deliverService()` additions

Add these cases to `examples/txodds/agent/service.ts`:

```ts
case 'fan-card': return deliverFanCard(payload)
case 'signal': return deliverSignal(payload)
case 'resolve-market': return deliverResolution(payload)
case 'proof-receipt': return deliverProofReceipt(payload)
```

That keeps the one-function fork story intact.
