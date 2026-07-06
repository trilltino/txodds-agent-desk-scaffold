import type { AgentTraceEvent } from '../../../types'

export function AgentTracePanel({ trace }: { trace: AgentTraceEvent[] }) {
  return (
    <article className="card tracePanel">
      <div className="cardHead">
        <h2>Agent Trace</h2>
        <span className="pill">{trace.length} steps</span>
      </div>
      {trace.length === 0 ? (
        <p className="muted">No Match Intelligence trace yet.</p>
      ) : (
        <ol className="traceList">
          {trace.slice(0, 12).map((item) => (
            <li key={item.id}>
              <span>{item.phase}</span>
              <strong>{item.summary}</strong>
            </li>
          ))}
        </ol>
      )}
    </article>
  )
}
