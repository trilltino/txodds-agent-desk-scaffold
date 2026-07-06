import { useEffect, useState } from 'react'
import type { Cluster, ChainStatus } from '../../core/chain/client'
import { watchSlots } from '../../core/chain/client'

// Each cluster keeps the last successful status plus the last error so the UI
// can show degraded connectivity without dropping the previous good slot.
type Entry = { status?: ChainStatus; error?: string }

const CLUSTERS: Cluster[] = ['devnet', 'mainnet']

// ChainStatusStrip subscribes through the Triton domain helper. Native mode
// prefers Rust/Yellowstone events with RPC fallback; browser mode uses Vite
// proxy polling.
export function ChainStatusStrip() {
  const [entries, setEntries] = useState<Record<Cluster, Entry>>({ devnet: {}, mainnet: {} })

  useEffect(() => {
    // watchSlots returns one stop function per cluster. Cleaning those up keeps
    // interval timers and Tauri listeners from surviving React unmount.
    const stops = CLUSTERS.map((cluster) =>
      watchSlots(
        cluster,
        (status) => setEntries((prev) => ({ ...prev, [cluster]: { status } })),
        (err) => setEntries((prev) => ({ ...prev, [cluster]: { ...prev[cluster], error: err.message } }))
      )
    )
    return () => stops.forEach((stop) => stop())
  }, [])

  return (
    <div className="chainStrip">
      {CLUSTERS.map((cluster) => {
        const { status, error } = entries[cluster]
        // Treat an error as the visible state even if an older successful status
        // exists; stale green chain health is worse than a conservative warning.
        const state = error ? 'down' : status ? 'live' : 'connecting'
        return (
          <span key={cluster} className={`chainPill ${state}`} title={status ? `solana-core ${status.solanaCore}` : error}>
            <i className="dot" />
            Triton {cluster}
            {status && !error
              ? ` - slot ${status.slot.toLocaleString()} - ${status.latencyMs}ms`
              : error
                ? ' - unreachable'
                : ' - connecting...'}
          </span>
        )
      })}
    </div>
  )
}
