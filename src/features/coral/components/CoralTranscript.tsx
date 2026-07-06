import type { CoralMessage } from '../../../types'

export function CoralTranscript({ messages }: { messages: CoralMessage[] }) {
  const visible = messages.slice(0, 18)
  return (
    <article className="card transcriptPanel">
      <div className="cardHead">
        <h2>Coral Transcript</h2>
        <span className="pill">{messages.length} messages</span>
      </div>
      {visible.length === 0 ? (
        <p className="muted">Run a selected TxLINE event to open a Coral session.</p>
      ) : (
        <ol className="transcriptList">
          {visible.map((message) => (
            <li key={message.id}>
              <span className="verb">{message.verb}</span>
              <div>
                <strong>{message.from}</strong>
                <p>{message.text}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </article>
  )
}
