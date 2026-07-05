import type { AgentRun } from '../types'

// SettlementLab presents the current run's settlement receipt without owning
// settlement behavior. Rust/sidecars decide whether a receipt is real, mocked,
// observed by Triton, or still pending.
export function SettlementLab({ run }: { run?: AgentRun }) {
  return (
    <article className="card">
      <div className="cardHead">
        <h2>Settlement Lab</h2>
        <span className="pill">Track 1</span>
      </div>
      <p className="muted">Build outcome markets, verifiable resolution cards, and escrow release/refund demos.</p>
      <div className="receipt">
        <span>Status</span><strong>{run?.settlement?.status ?? 'not_started'}</strong>
        <span>Reference</span><code>{run?.settlement?.reference ?? '—'}</code>
        <span>Triton observed</span><strong>{run?.settlement?.tritonObserved ? 'yes' : 'not yet'}</strong>
        <span>Explorer</span><code>{run?.settlement?.explorerUrl ?? '—'}</code>
      </div>
    </article>
  )
}
