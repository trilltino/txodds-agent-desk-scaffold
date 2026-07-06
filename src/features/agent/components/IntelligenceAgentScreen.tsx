import type { AgentRun, CoralAgentManifest, TrackMode } from '../../../types'
import { scoreBid } from '../../../core/coral/scoring'

// IntelligenceAgentScreen is the agent-track surface for the single active
// Rust-backed Match Intelligence Coral agent.
export function IntelligenceAgentScreen({
  agents,
  run,
  track,
  onRun
}: {
  agents: CoralAgentManifest[]
  run?: AgentRun
  track: TrackMode
  onRun: () => void
}) {
  const activeIds = new Set(run?.bids.map((bid) => bid.agentId) ?? [])
  const activeAgents = run
    ? agents.filter((agent) => activeIds.has(agent.id) || agent.id === 'match-intelligence-agent')
    : agents

  return (
    <article className="card">
      <div className="cardHead">
        <h2>Intelligence Agent</h2>
        <span className="pill">{track}</span>
      </div>
      <div className="agentRoster">
        {activeAgents.map((agent) => (
          <div key={agent.id} className="agentChip" title={agent.manifestPath}>
            <strong>{agent.id}</strong>
            <span>{agent.coralRole} - {agent.service}</span>
          </div>
        ))}
      </div>
      {!run ? <p className="muted">Start a round to see the decision trace for the latest trigger.</p> : null}
      {run?.bids.map((bid) => (
        <div key={bid.agentId} className={run.winner?.agentId === bid.agentId ? 'bid winner' : 'bid'}>
          <div>
            <strong>{bid.agentId}</strong>
            <p>{bid.note}</p>
          </div>
          <div className="metrics">
            <span>{bid.priceSol === 0 ? 'no spend' : `${bid.priceSol} SOL`}</span>
            <span>{Math.round(bid.confidence * 100)}%</span>
            <span>score {scoreBid(track, bid).toFixed(2)}</span>
          </div>
        </div>
      ))}
      <button className="secondary" onClick={onRun}>Re-run round</button>
    </article>
  )
}
