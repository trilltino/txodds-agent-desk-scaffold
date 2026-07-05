import type { TrackMode, TxLineEvent } from '../types'

interface Props {
  events: TxLineEvent[]
  selected: TxLineEvent
  onSelect: (event: TxLineEvent) => void
  onStartRound: (event: TxLineEvent, track?: TrackMode) => void
}

export function LiveFeed({ events, selected, onSelect, onStartRound }: Props) {
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
