import type { AgentRun, CoralAgentManifest, TrackMode } from '../../../types'
import { scoreBid } from '../../../core/coral/scoring'

// IntelligenceAgentScreen is the agent-track surface. Today it visualizes the
// legacy Coral-round execution trace; the autonomous Match Intelligence Agent
// (signals, decisions, accuracy tracking) replaces this internals view in PR 5
// of docs/architecture/01-lean-e2e-architecture.md.
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
  // Only display the buyer and agents that actually participated in this run so
  // the roster reads like an execution trace instead of static marketing copy.
  const activeIds = new Set(run?.bids.map((bid) => bid.agentId) ?? [])
  const activeAgents = agents.filter((agent) => agent.coralRole === 'buyer' || activeIds.has(agent.id))

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
            <span>{bid.priceSol} SOL</span>
            <span>{Math.round(bid.confidence * 100)}%</span>
            <span>score {scoreBid(track, bid).toFixed(2)}</span>
          </div>
        </div>
      ))}
      <button className="secondary" onClick={onRun}>Re-run round</button>
    </article>
  )
}
