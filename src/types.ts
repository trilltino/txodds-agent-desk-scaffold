// Shared frontend contracts. These shapes intentionally mirror the Rust
// structs in src-tauri/src/types.rs so Tauri IPC can move typed app state
// between the backend and the webview without translation glue in components.

// The three product views use the same agent/run primitives but emphasize
// different judging tracks and delivery formats.
export type TrackMode = 'settlement' | 'trading' | 'fan'

// Top-level product pages. Each page maps to one user app while still sharing
// the same TxLINE event stream and persisted run history underneath.
export type UserAppPage = 'pulse' | 'markets' | 'agent'

// Public Coral agent metadata shown in the UI. Today this is mirrored by
// frontend fallback data and Rust built-ins; archived TOML manifests live under
// docs/legacy-coral-agents/.
export interface CoralAgentManifest {
  id: string
  displayName: string
  coralRole: 'buyer' | 'seller' | 'verifier' | 'settlement' | string
  service: string
  manifestPath: string
  description: string
}

// TxLINE event kinds normalized into one enum so live ingestion and persisted
// receipts drive the same UI and market engine.
export type TxLineEventKind =
  | 'fixture'
  | 'score_update'
  | 'odds_update'
  | 'goal'
  | 'red_card'
  | 'final_whistle'
  | 'odds_move'
  | 'proof_received'

// Fixture metadata shown by TxLINE-backed screens.
export interface Fixture {
  fixtureId: number
  home: string
  away: string
  startTime?: string
  competition?: string
  status?: string
}

// Odds quotes store both decimal odds and implied probability because strategy
// code reasons about probability movement, not only displayed prices.
export interface OddsQuote {
  fixtureId: number
  outcome: 'home' | 'draw' | 'away' | string
  decimal: number
  impliedProbability: number
  source?: string
  ts: string
}

// Canonical event payload consumed by the raw feed and track engines. The raw
// field is preserved for debugging while normalized fields drive app behavior.
export interface TxLineEvent {
  id: string
  kind: TxLineEventKind
  fixtureId: number
  seq?: number
  txlineTs?: string
  action?: string
  confirmed?: boolean
  participant?: string
  period?: string
  statKeys: string[]
  schemaFamily?: string
  title: string
  body: string
  ts: string
  raw?: unknown
  odds?: OddsQuote[]
  score?: { home: number; away: number }
  proof?: TxLineProofReceipt
}

// Rust emits ingest status for live streams so the UI can show whether it is
// genuinely connected to TxLINE.
export interface IngestStatus {
  source: string
  state: string
  detail: string
}

// Optional proof receipt used when TxLINE or an on-chain program provides a
// verifiable stat/proof reference for settlement.
export interface TxLineProofReceipt {
  fixtureId: number
  seq?: number
  statKey?: number
  statKeys: string[]
  txlineTs?: string
  epochDay?: number
  merkleRoot?: string
  statProofHash?: string
  rootPda?: string
  txlineProgram?: string
  rootObservedSlot?: number
  proofPresent: boolean
  rootPresent: boolean
  simulationStatus: ValidationSimulationStatus
  verified: boolean
  note: string
  raw?: unknown
}

export type ValidationSimulationStatus = 'not_started' | 'passed' | 'failed' | 'unavailable'

export type TxOracleInstructionKind =
  | 'insert_scores_root'
  | 'insert_batch_root'
  | 'insert_fixtures_root'
  | 'unknown'

export interface TxOracleRootEvent {
  signature: string
  slot: number
  programId: string
  instruction: TxOracleInstructionKind
  epochDay?: number
  merkleRoot?: string
  rootPda?: string
  fixtureId?: number
}

// A seller/verifier/settlement bid in the Coral-style market round.
export interface AgentBid {
  agentId: string
  role: 'sharp' | 'risk' | 'pundit' | 'settlement' | 'fan' | 'verifier'
  priceSol: number
  confidence: number
  etaMs: number
  note: string
}

// Artifact produced by the winning agent. The payload is hash-bound so Rust can
// create stable settlement references and ledger entries.
export interface AgentDelivery {
  agentId: string
  title: string
  payload: string
  sha256: string
  citations: string[]
  strategy?: string
  risk?: string
  fanCopy?: string
}

// Deterministic verifier output. LLMs may help produce explanations later, but
// settlement gates should continue to depend on structured verdict fields.
export interface VerificationVerdict {
  status: 'pass' | 'fail' | 'needs_review'
  reason: string
  checked: Array<'txline-input' | 'hash' | 'proof' | 'policy' | 'settlement'>
}

// Settlement receipt visible to the UI. The receipt may be a Solana Pay result,
// a CoralOS sidecar result, or a later native Solana escrow result.
export interface SettlementReceipt {
  rail?: 'solana_pay' | 'coralos' | string
  status: 'not_started' | 'escrow_created' | 'deposited' | 'released' | 'refunded'
  reference?: string
  escrowPda?: string
  depositTx?: string
  releaseTx?: string
  explorerUrl?: string
  tritonObserved?: boolean
  tritonSlot?: number
  paymentUrl?: string
  paymentReference?: string
  paymentMemo?: string
  paymentSignature?: string
  paymentStatus?: 'pending' | 'observed' | 'confirmed' | string
  paymentRecipient?: string
  paymentAmountSol?: number
}

// Solana Pay Transfer Request generated by Rust. The webview may render this
// as text or QR, but Rust creates and verifies it.
export interface SolanaPayIntent {
  runId: string
  recipient: string
  amountSol: number
  splToken?: string
  reference: string
  label: string
  message: string
  memo: string
  url: string
  status: 'pending' | 'observed' | 'confirmed'
  createdAt: string
  signature?: string
  slot?: number
}

// Full persisted market run rendered by the current feature screens.
export interface AgentRun {
  runId: string
  track: TrackMode
  trigger: TxLineEvent
  bids: AgentBid[]
  winner?: AgentBid
  delivery?: AgentDelivery
  verdict?: VerificationVerdict
  settlement?: SettlementReceipt
  timeline: Array<{ at: string; label: string; detail: string }>
}

export type CoralVerb =
  | 'OBSERVED'
  | 'NORMALIZED'
  | 'ROOT_OBSERVED'
  | 'WANT'
  | 'AGENT_THOUGHT'
  | 'TOOL_CALL'
  | 'TOOL_RESULT'
  | 'SIGNAL'
  | 'PROOF_REQUESTED'
  | 'PROOF_RECEIVED'
  | 'VALIDATION_SIMULATED'
  | 'PAYMENT_REQUIRED'
  | 'WALLET_CONNECTED'
  | 'PAYMENT_PROOF'
  | 'PAYMENT_CONFIRMED'
  | 'VERIFIED'
  | 'SETTLED'
  | 'EVALUATED'

export interface CoralSession {
  id: string
  threadId: string
  fixtureId: number
  track: TrackMode
  createdAt: string
}

export interface CoralMessage {
  id: string
  sessionId: string
  threadId: string
  round: number
  from: string
  to: string[]
  verb: CoralVerb
  text: string
  payload?: unknown
  ts: string
}

export type AgentTracePhase =
  | 'observe'
  | 'derive'
  | 'tool_call'
  | 'tool_result'
  | 'llm_reasoning'
  | 'decision'
  | 'action'
  | 'proof'
  | 'payment'
  | 'evaluation'

export interface AgentTraceEvent {
  id: string
  runId: string
  round: number
  phase: AgentTracePhase
  summary: string
  payload?: unknown
  ts: string
}

export interface WalletContext {
  provider: 'phantom' | 'solana-pay' | 'unknown'
  publicKey?: string
  connected: boolean
  cluster: 'devnet' | 'mainnet-beta'
}
