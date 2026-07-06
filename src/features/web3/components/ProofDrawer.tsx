import type { AgentRun, TxLineProofReceipt } from '../../../types'

// ProofDrawer is the judge/operator audit view: human-readable receipt first,
// raw JSON second. It renders the timeline that Rust appends as each phase
// completes.
export function ProofDrawer({ run, proof }: { run?: AgentRun; proof?: TxLineProofReceipt }) {
  const proofState = proof?.simulationStatus ?? 'not_started'
  return (
    <article className={`card proofCard proof-${proofState}`}>
      <div className="cardHead">
        <h2>Proof Drawer</h2>
        <span className="pill">audit trail</span>
      </div>
      {!run ? <p className="muted">No verified run yet.</p> : (
        <>
          <div className="receipt">
            <span>Rail</span><strong>{run.settlement?.rail ?? '-'}</strong>
            <span>Pay reference</span><code>{run.settlement?.paymentReference ?? '-'}</code>
            <span>Pay signature</span><code>{run.settlement?.paymentSignature ?? '-'}</code>
            <span>Fixture</span><strong>{proof?.fixtureId ?? run.trigger.fixtureId}</strong>
            <span>Seq</span><strong>{proof?.seq ?? run.trigger.seq ?? '-'}</strong>
            <span>Proof present</span><strong>{proof?.proofPresent ? 'yes' : 'not yet'}</strong>
            <span>Root present</span><strong>{proof?.rootPresent ? 'yes' : 'not yet'}</strong>
            <span>Simulation</span><strong>{proofState}</strong>
            <span>Proof note</span><code>{proof?.note ?? '-'}</code>
          </div>
          <ol className="timeline">
            {run.timeline.map((item, idx) => (
              <li key={`${item.label}-${idx}`}><strong>{item.label}</strong><span>{item.detail}</span></li>
            ))}
          </ol>
          <pre>{JSON.stringify({ runId: run.runId, verdict: run.verdict, settlement: run.settlement, proof }, null, 2)}</pre>
        </>
      )}
    </article>
  )
}
