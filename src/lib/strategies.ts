import type { AgentBid, TrackMode, TxLineEvent } from '../types'

export function generateBids(event: TxLineEvent, track: TrackMode): AgentBid[] {
  const base = event.kind === 'odds_move' ? 0.82 : event.kind === 'goal' ? 0.78 : 0.7
  const bids: AgentBid[] = [
    {
      agentId: 'sharp-movement-agent',
      role: 'sharp',
      priceSol: 0.018,
      confidence: Math.min(0.94, base + 0.08),
      etaMs: 900,
      note: 'Detects implied-probability movement, compares against previous board, outputs signal + rationale.'
    },
    {
      agentId: 'risk-manager-agent',
      role: 'risk',
      priceSol: 0.012,
      confidence: Math.min(0.9, base + 0.02),
      etaMs: 700,
      note: 'Turns a signal into no-action / observe / simulate-position with bounded downside.'
    },
    {
      agentId: 'ai-pundit-agent',
      role: 'pundit',
      priceSol: 0.01,
      confidence: Math.min(0.88, base + 0.01),
      etaMs: 600,
      note: 'Explains the football story and market movement in plain English for fans.'
    },
    {
      agentId: 'settlement-verifier-agent',
      role: 'settlement',
      priceSol: 0.016,
      confidence: 0.92,
      etaMs: 1100,
      note: 'Builds a proof receipt, checks TxLINE stat/proof availability, and gates escrow release.'
    }
  ]
  return bids.filter((bid) => {
    if (track === 'fan') return ['pundit', 'fan', 'sharp'].includes(bid.role)
    if (track === 'trading') return ['sharp', 'risk', 'pundit'].includes(bid.role)
    return ['settlement', 'verifier', 'sharp', 'risk'].includes(bid.role)
  })
}
