import type { AgentRun, TxLineEvent } from '../types'
import { exportFanCardNative, native } from '../desktop/transport'

// FanMode converts the selected event or winning delivery into plain-language
// output for the consumer/fan track.
export function FanMode({ run, selectedEvent }: { run?: AgentRun; selectedEvent?: TxLineEvent }) {
  // Prefer the delivery's fan copy when an agent run exists; otherwise keep the
  // selected TxLINE event readable before any market round has run.
  const payload = run?.delivery?.fanCopy ?? selectedEvent?.body ?? 'Waiting for the first live TxLINE event.'
  const title = selectedEvent?.title ?? 'Live World Cup feed starting'
  async function exportCard() {
    // Export is native-only because Rust owns filesystem access.
    if (!run || !native) return
    const result = await exportFanCardNative(run.runId)
    console.info(`Fan card exported to ${result.path}`)
  }

  return (
    <article className="card fan">
      <div className="cardHead">
        <h2>Fan Mode</h2>
        <span className="pill">Track 3</span>
      </div>
      <h3>{title}</h3>
      <p>{payload}</p>
      <div className="shareCard">
        <strong>Shareable card</strong>
        <p>{title} - {payload}</p>
      </div>
      <button className="secondary" disabled={!run || !native} onClick={exportCard}>Export fan card</button>
    </article>
  )
}
