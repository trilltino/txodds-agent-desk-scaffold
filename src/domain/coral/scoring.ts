import type { AgentBid, TrackMode } from '../../types'

// Score a bid by confidence, price, ETA, and role/track fit. This intentionally
// stays deterministic so browser fallback and Rust behavior are explainable.
export function scoreBid(track: TrackMode, bid: AgentBid): number {
  // Role boost is where specialized strategies start: trading favors sharp/risk
  // sellers, settlement favors settlement/verifier, and fan mode favors pundits.
  const roleBoost: Record<string, number> = {
    sharp: track === 'trading' ? 1.25 : 1,
    risk: track === 'trading' ? 1.15 : 1,
    settlement: track === 'settlement' ? 1.25 : 1,
    verifier: track === 'settlement' ? 1.2 : 1,
    pundit: track === 'fan' ? 1.25 : 1,
    fan: track === 'fan' ? 1.2 : 1
  }
  const pricePenalty = Math.max(0.2, 1 - bid.priceSol * 4)
  const etaBonus = bid.etaMs < 1500 ? 1.05 : 1
  return bid.confidence * pricePenalty * etaBonus * (roleBoost[bid.role] ?? 1)
}

// Pick the highest scoring bid without mutating the original bid array.
export function chooseWinner(track: TrackMode, bids: AgentBid[]): AgentBid | undefined {
  return [...bids].sort((a, b) => scoreBid(track, b) - scoreBid(track, a))[0]
}
