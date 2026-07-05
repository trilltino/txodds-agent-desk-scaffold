import type { TrackMode, TxLineEvent } from '../types'

// LiveFeed renders normalized TxLINE events regardless of whether they came
// from Rust live ingest, replay, or browser mock fixtures.
interface Props {
  events: TxLineEvent[]
  selected: TxLineEvent
  onSelect: (event: TxLineEvent) => void
  onStartRound: (event: TxLineEvent, track?: TrackMode) => void
}

export function LiveFeed({ events, selected, onSelect, onStartRound }: Props) {
  // The component stays intentionally dumb: selecting an event and creating a
  // WANT are callbacks so backend/native mode remains controlled by App.
  return (
    <article className="card">
      <div className="cardHead">
        <h2>Live TxLINE feed</h2>
        <span className="pill">SSE-ready</span>
      </div>
      <p className="muted">Scores, odds, match events, and proof receipts become triggers. Mock data renders until credentials are added.</p>
      <div className="eventList">
        {events.map((event) => (
          <button key={event.id} className={selected.id === event.id ? 'event selected' : 'event'} onClick={() => onSelect(event)}>
            <strong>{event.title}</strong>
            <span>{event.kind} · fixture {event.fixtureId}</span>
            <small>{event.body}</small>
          </button>
        ))}
      </div>
      <button className="secondary" onClick={() => onStartRound(selected)}>Create WANT from selected event</button>
    </article>
  )
}
