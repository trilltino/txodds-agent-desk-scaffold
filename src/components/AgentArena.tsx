import type { AgentRun, TrackMode } from '../types'
import { scoreBid } from '../lib/scoring'

export function AgentArena({ run, track, onRun }: { run?: AgentRun; track: TrackMode; onRun: () => void }) {
  return (
    <article className="card">
      <div className="cardHead">
        <h2>Agent arena</h2>
        <span className="pill">{track}</span>
      </div>
      {!run ? <p className="muted">Start a round to see specialist agents bid.</p> : null}
      {run?.bids.map((bid) => (
        <div key={bid.agentId} className={run.winner?.agentId === bid.agentId ? 'bid winner' : 'bid'}>
          <div>
            <strong>{bid.agentId}</strong>
            <p>{bid.note}</p>
          </div>
          <div className="metrics">
            <span>{bid.priceSol} SOL</span>
            <span>{Math.round(bid.confidence * 100)}%</span>
            <span>score {scoreBid(track, bid).toFixed(2)}</span>
          </div>
        </div>
      ))}
      <button className="secondary" onClick={onRun}>Re-run market</button>
    </article>
  )
}
