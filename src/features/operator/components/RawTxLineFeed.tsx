import type { IngestStatus, TrackMode, TxLineEvent } from '../../../types'
import { useState } from 'react'

// RawTxLineFeed is the operator view of normalized TxLINE events, regardless
// of whether they came from Rust live ingest or replay.
interface Props {
  events: TxLineEvent[]
  selected?: TxLineEvent
  ingestStatuses: IngestStatus[]
  onSelect: (event: TxLineEvent) => void
  onStartRound: (event: TxLineEvent, track?: TrackMode) => void
}

export function RawTxLineFeed({ events, selected, ingestStatuses, onSelect, onStartRound }: Props) {
  // The component stays intentionally dumb: selecting an event and creating a
  // WANT are callbacks so backend/native mode remains controlled by App.
  const [mode, setMode] = useState<'normalized' | 'proof' | 'raw'>('normalized')
  const primaryStatus = ingestStatuses[0]
  const visibleEvents = mode === 'proof'
    ? events.filter((event) => event.kind === 'proof_received' || event.proof)
    : events
  return (
    <article className="card">
      <div className="cardHead">
        <h2>TxLINE feed</h2>
        <span className="pill">{primaryStatus?.state ?? 'starting'}</span>
      </div>
      <div className="statusStack">
        {ingestStatuses.map((status) => (
          <div key={status.source} className="statusLine">
            <strong>{status.source}</strong>
            <span>{status.detail}</span>
          </div>
        ))}
      </div>
      <div className="segmented">
        {(['normalized', 'proof', 'raw'] as const).map((value) => (
          <button key={value} className={mode === value ? 'active' : ''} onClick={() => setMode(value)}>
            {value}
          </button>
        ))}
      </div>
      <div className="eventList">
        {visibleEvents.length === 0 ? (
          <div className="emptyState">Waiting for TxLINE events.</div>
        ) : visibleEvents.map((event) => (
          <button key={event.id} className={selected?.id === event.id ? 'event selected' : 'event'} onClick={() => onSelect(event)}>
            <strong>{event.title}</strong>
            <span>{event.kind} - fixture {event.fixtureId}{event.seq ? ` - seq ${event.seq}` : ''}</span>
            <small>{mode === 'raw' ? JSON.stringify(event.raw ?? event.proof ?? event).slice(0, 240) : event.body}</small>
          </button>
        ))}
      </div>
      <button className="secondary" disabled={!selected} onClick={() => selected && onStartRound(selected)}>Run selected event</button>
    </article>
  )
}
