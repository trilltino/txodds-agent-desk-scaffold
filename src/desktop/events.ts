// Native event topics: the TypeScript mirror of src-tauri/src/event_bus.rs.
// Both files are constant tables kept in lockstep; adding a topic means adding
// it to both in the same change. React must subscribe through these constants
// rather than string literals so topic drift is caught in review.

export const NativeEvents = {
  txlineEvent: 'txline://event',
  ingestStatus: 'ingest://status',
  chainSlot: 'chain://slot',
  chainAccount: 'chain://account',
  chainTx: 'chain://tx',
  payIntent: 'pay://intent',
  payStatus: 'pay://status',
  settlementReceipt: 'settle://receipt',
  marketRound: 'market://round',
  appNotification: 'app://notification'
  // Reserved lean-track topics (docs/architecture/01-lean-e2e-architecture.md section 5):
  // consumer://room-updated, consumer://pulse-card, web3://market-updated,
  // web3://proof-receipt, agent://runtime-status, agent://signal,
  // agent://decision, agent://execution, agent://evaluation
} as const

export type NativeEventName = (typeof NativeEvents)[keyof typeof NativeEvents]
