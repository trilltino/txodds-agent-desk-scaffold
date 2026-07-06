import type { AgentRun } from '../../../types'

// ProofDrawer is the judge/operator audit view: human-readable receipt first,
// raw JSON second. It renders the timeline that Rust/browser fallback code
// appends as each phase completes.
export function ProofDrawer({ run }: { run?: AgentRun }) {
  return (
    <article className="card">
      <div className="cardHead">
        <h2>Proof Drawer</h2>
        <span className="pill">audit trail</span>
      </div>
      {!run ? <p className="muted">No run yet.</p> : (
        <>
          <div className="receipt">
            <span>Rail</span><strong>{run.settlement?.rail ?? '-'}</strong>
            <span>Pay reference</span><code>{run.settlement?.paymentReference ?? '-'}</code>
            <span>Pay signature</span><code>{run.settlement?.paymentSignature ?? '-'}</code>
          </div>
          <ol className="timeline">
            {run.timeline.map((item, idx) => (
              <li key={`${item.label}-${idx}`}><strong>{item.label}</strong><span>{item.detail}</span></li>
            ))}
          </ol>
          <pre>{JSON.stringify({ runId: run.runId, verdict: run.verdict, settlement: run.settlement }, null, 2)}</pre>
        </>
      )}
    </article>
  )
}
