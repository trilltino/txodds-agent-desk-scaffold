import { chainRpcNative, chainStatusNative, native, observeSettlementNative, onChainSlot } from '../../desktop/transport'

// Triton/Solana reads are desktop-only. Rust owns endpoints/tokens and the
// webview never talks to RPC providers directly.

export type Cluster = 'devnet' | 'mainnet'

export interface ChainStatus {
  cluster: Cluster
  slot: number
  solanaCore: string
  latencyMs: number
  ts: string
}

export interface TritonObservation {
  kind: 'deposit' | 'release' | 'refund' | 'account_update' | 'program_tx'
  signature?: string
  slot?: number
  blockhash?: string
  account?: string
  programId?: string
  note: string
}

function desktopOnly(): never {
  throw new Error('Chain access is desktop-only; Rust owns RPC credentials')
}

export async function tritonRpc<T>(cluster: Cluster, method: string, params: unknown[] = []): Promise<T> {
  if (!native) desktopOnly()
  return chainRpcNative<T>(cluster, method, params)
}

export const getSlot = (cluster: Cluster) => tritonRpc<number>(cluster, 'getSlot')

export const getVersion = (cluster: Cluster) => tritonRpc<{ 'solana-core': string }>(cluster, 'getVersion')

export const getBalanceSol = (cluster: Cluster, pubkey: string) =>
  tritonRpc<{ value: number }>(cluster, 'getBalance', [pubkey]).then((r) => r.value / 1_000_000_000)

export const getSignaturesForAddress = (cluster: Cluster, address: string, limit = 10) =>
  tritonRpc<Array<{ signature: string; slot: number; err: unknown }>>(cluster, 'getSignaturesForAddress', [
    address,
    { limit }
  ])

export async function getChainStatus(cluster: Cluster): Promise<ChainStatus> {
  if (!native) desktopOnly()
  return chainStatusNative(cluster)
}

/**
 * Poll chain status until the returned stop function is called.
 * The devnet token is on the developer rate tier, so keep intervalMs >= 4000.
 */
export function watchSlots(
  cluster: Cluster,
  onStatus: (status: ChainStatus) => void,
  onError: (err: Error) => void = () => {},
  intervalMs = 5000
): () => void {
  if (!native) desktopOnly()

  // Native mode listens for Yellowstone/Rust slot pushes but also polls as a
  // conservative live fallback while the stream connects.
  const stopEvent = onChainSlot((status) => {
    if (status.cluster === cluster) onStatus(status)
  })
  let stopped = false
  const tick = async () => {
    if (stopped) return
    try {
      onStatus(await getChainStatus(cluster))
    } catch (err) {
      if (!stopped) onError(err as Error)
    }
  }
  void tick()
  const timer = setInterval(tick, intervalMs)
  return () => {
    stopped = true
    stopEvent()
    clearInterval(timer)
  }
}

/**
 * Stamp a settlement reference with live devnet chain state: current slot and
 * latest blockhash. Once real escrow PDAs exist, pass the account address to
 * also surface its most recent signature.
 */
export async function observeSettlement(reference: string, escrowAccount?: string): Promise<TritonObservation> {
  if (!native) desktopOnly()
  return observeSettlementNative(reference, escrowAccount)
}
