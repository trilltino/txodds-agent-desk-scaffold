import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  AgentRun,
  AgentTraceEvent,
  CoralAgentManifest,
  CoralMessage,
  CoralSession,
  IngestStatus,
  SolanaPayIntent,
  TrackMode,
  TxLineEvent,
  TxLineProofReceipt,
  TxOracleRootEvent
} from '../types'
import type { ChainStatus, Cluster, TritonObservation } from '../core/chain/client'
import { NativeEvents } from './events'

// Runtime feature flag used to block direct browser rendering. The app's data
// and privileged operations are desktop-only.
export const native = isTauri()

// PublicConfig is deliberately non-secret. Rust may know tokens, keypaths, and
// sidecar credentials; the webview only receives booleans and public origins.
export interface PublicConfig {
  txlineApiOrigin: string
  txlineNetwork: string
  solanaCluster: string
  oddsMoveTriggerPct: number
  maxDevnetSpendSol: number
  txlineConfigured: boolean
  tritonConfigured: boolean
  tritonDevnetConfigured: boolean
  tritonMainnetConfigured: boolean
  yellowstoneConfigured: boolean
  solanaPayConfigured: boolean
  coralosConfigured: boolean
  coralosConsoleEnabled: boolean
  llmConfigured: boolean
  llmProvider: string
  llmModel: string
  axumEnabled: boolean
}

// Native export commands return a local path plus user-facing copy. The webview
// requests the export but Rust owns filesystem writes.
export interface ExportResult {
  path: string
  shareText: string
}

// Thin invoke wrapper. Keeping this generic function small makes it obvious
// which named Tauri command each exported helper calls.
export function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(name, args)
}

export async function getConfig(): Promise<PublicConfig> {
  return command<PublicConfig>('get_config')
}

export async function listCoralAgentsNative(): Promise<CoralAgentManifest[]> {
  return command<CoralAgentManifest[]>('list_coral_agents')
}

export async function listCoralMessagesNative(runId: string): Promise<CoralMessage[]> {
  return command<CoralMessage[]>('coral_list_messages', { runId })
}

export async function listAgentTraceNative(runId: string): Promise<AgentTraceEvent[]> {
  return command<AgentTraceEvent[]>('agent_list_trace', { runId })
}

export async function chainRpcNative<T>(cluster: Cluster, method: string, params: unknown[] = []): Promise<T> {
  return command<T>('chain_rpc', { cluster, method, params })
}

export async function chainStatusNative(cluster: Cluster): Promise<ChainStatus> {
  return command<ChainStatus>('chain_status', { cluster })
}

export async function observeSettlementNative(reference: string, escrowAccount?: string): Promise<TritonObservation> {
  return command<TritonObservation>('observe_settlement', { reference, escrowAccount })
}

export async function startTxLine(fixtureId?: string): Promise<void> {
  if (!native) throw new Error('World Cup Agent Desk requires the Tauri desktop runtime')
  return command<void>('start_txline', { mode: 'live', fixtureId })
}

export async function stopTxLine(): Promise<void> {
  if (!native) throw new Error('World Cup Agent Desk requires the Tauri desktop runtime')
  return command<void>('stop_txline')
}

export async function runAgentRoundNative(trigger: TxLineEvent, track: TrackMode): Promise<AgentRun> {
  return command<AgentRun>('run_agent_round', { trigger, track })
}

export async function txlineFixturesSnapshotNative(startEpochDay?: number, competitionId?: number): Promise<unknown> {
  return command<unknown>('txline_fixtures_snapshot', { startEpochDay, competitionId })
}

export async function txlineOddsSnapshotNative(fixtureId: number, asOf?: number): Promise<unknown> {
  return command<unknown>('txline_odds_snapshot', { fixtureId, asOf })
}

export async function txlineOddsUpdatesNative(fixtureId: number): Promise<unknown> {
  return command<unknown>('txline_odds_updates', { fixtureId })
}

export async function txlineOddsIntervalNative(epochDay: number, hourOfDay: number, interval: number): Promise<unknown> {
  return command<unknown>('txline_odds_interval', { epochDay, hourOfDay, interval })
}

export async function txlineScoresSnapshotNative(fixtureId: number, asOf?: number): Promise<unknown> {
  return command<unknown>('txline_scores_snapshot', { fixtureId, asOf })
}

export async function txlineScoresUpdatesNative(fixtureId: number): Promise<unknown> {
  return command<unknown>('txline_scores_updates', { fixtureId })
}

export async function txlineScoresHistoricalNative(fixtureId: number): Promise<unknown> {
  return command<unknown>('txline_scores_historical', { fixtureId })
}

export async function txlineScoresIntervalNative(epochDay: number, hourOfDay: number, interval: number): Promise<unknown> {
  return command<unknown>('txline_scores_interval', { epochDay, hourOfDay, interval })
}

export async function txlineScoresStatValidationNative(args: {
  fixtureId: number
  seq: number
  statKey?: number
  statKey2?: number
  statKeys?: string
}): Promise<unknown> {
  return command<unknown>('txline_scores_stat_validation', args)
}

export async function fetchTxLineNative(path: string): Promise<unknown> {
  return command<unknown>('fetch_txline', { path })
}

export async function listRunsNative(): Promise<AgentRun[]> {
  return command<AgentRun[]>('list_runs')
}

export async function createSolanaPayIntentNative(runId: string): Promise<SolanaPayIntent> {
  return command<SolanaPayIntent>('create_solana_pay_intent', { runId })
}

export async function verifySolanaPayIntentNative(reference: string): Promise<SolanaPayIntent> {
  return command<SolanaPayIntent>('verify_solana_pay_intent', { reference })
}

export async function listPaymentIntentsNative(runId?: string): Promise<SolanaPayIntent[]> {
  return command<SolanaPayIntent[]>('list_payment_intents', { runId })
}

export async function exportFanCardNative(runId: string): Promise<ExportResult> {
  return command<ExportResult>('export_fan_card', { runId })
}

export async function watchAccountNative(account: string): Promise<void> {
  if (!native) return
  return command<void>('watch_account', { account })
}

export async function watchProgramNative(programId: string): Promise<void> {
  if (!native) return
  return command<void>('watch_program', { programId })
}

export async function watchReferenceNative(reference: string): Promise<void> {
  if (!native) return
  return command<void>('watch_reference', { reference })
}

export function onNativeEvent<T>(event: string, cb: (payload: T) => void): () => void {
  if (!native) return () => {}
  // Tauri listen returns the unlisten function asynchronously. The active flag
  // prevents late registration from leaking after React unmounts a subscriber.
  let active = true
  let unlisten: (() => void) | undefined
  listen<T>(event, (message) => {
    if (active) cb(message.payload)
  }).then((fn) => {
    if (active) unlisten = fn
    else fn()
  })
  return () => {
    active = false
    unlisten?.()
  }
}

export const onTxLineEvent = (cb: (event: TxLineEvent) => void) => onNativeEvent<TxLineEvent>(NativeEvents.txlineEvent, cb)
export const onIngestStatus = (cb: (status: IngestStatus) => void) => onNativeEvent<IngestStatus>(NativeEvents.ingestStatus, cb)
export const onSolanaPayIntent = (cb: (intent: SolanaPayIntent) => void) => onNativeEvent<SolanaPayIntent>(NativeEvents.payIntent, cb)
export const onSolanaPayStatus = (cb: (intent: SolanaPayIntent) => void) => onNativeEvent<SolanaPayIntent>(NativeEvents.payStatus, cb)
export const onChainSlot = (cb: (status: ChainStatus) => void) => onNativeEvent<ChainStatus>(NativeEvents.chainSlot, cb)
export const onCoralSession = (cb: (session: CoralSession) => void) => onNativeEvent<CoralSession>(NativeEvents.coralSession, cb)
export const onCoralMessage = (cb: (message: CoralMessage) => void) => onNativeEvent<CoralMessage>(NativeEvents.coralMessage, cb)
export const onAgentTrace = (cb: (trace: AgentTraceEvent) => void) => onNativeEvent<AgentTraceEvent>(NativeEvents.agentTrace, cb)
export const onProofReceipt = (cb: (receipt: TxLineProofReceipt) => void) => onNativeEvent<TxLineProofReceipt>(NativeEvents.web3ProofReceipt, cb)
export const onTxOracleRoot = (cb: (root: TxOracleRootEvent) => void) => onNativeEvent<TxOracleRootEvent>(NativeEvents.txoracleRoot, cb)
