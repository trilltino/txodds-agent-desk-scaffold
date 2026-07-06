// Agent track contract: Match Intelligence Agent signals and decisions
// (TypeScript mirror of src-tauri/src/domain/agent.rs). One autonomous runtime
// observes, decides with deterministic formulas, acts, and evaluates itself.
// LLMs may explain a decision that code has already made; they never make one.

export type SignalType =
  | 'sharp_odds_move'
  | 'score_event'
  | 'red_card_reprice'
  | 'late_market_shift'
  | 'proof_ready'

export type SignalSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface AgentSignal {
  id: string
  fixtureId: number
  sourceEventId: string
  type: SignalType
  severity: SignalSeverity
  confidence: number
  /** Measured inputs behind the signal so every emission is reproducible. */
  features: Record<string, number | string | boolean>
  rationale: string
  createdAt: string
}

export type AgentAction =
  | 'ignore'
  | 'watch'
  | 'notify'
  | 'simulate_position'
  | 'fetch_proof'
  | 'trigger_resolution'

export type ExecutionStatus = 'pending' | 'executed' | 'blocked' | 'failed'

/** One named policy gate with its outcome, so the UI shows why an action ran or was blocked. */
export interface PolicyCheck {
  name: string
  passed: boolean
  detail: string
}

export interface AgentDecision {
  id: string
  signalId: string
  action: AgentAction
  confidence: number
  policyChecks: PolicyCheck[]
  explanation: string
  executionStatus: ExecutionStatus
  createdAt: string
}

/** Rolling self-evaluation metrics surfaced by the AccuracyTracker UI. */
export interface AgentMetrics {
  signalsEmitted: number
  signalsCorrect: number
  signalsIncorrect: number
  signalsExpired: number
  avgTimeToOutcomeSecs?: number
}
