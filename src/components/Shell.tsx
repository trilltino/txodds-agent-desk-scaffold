import type { TrackMode } from '../types'
import { ChainStatusStrip } from './ChainStatus'

// Shell owns global page chrome: app identity, track tabs, chain status, and
// the primary manual round trigger. It does not know how backend work runs.
interface Props {
  track: TrackMode
  setTrack: (track: TrackMode) => void
  onStart: () => void
  children: React.ReactNode
}

export function Shell({ track, setTrack, onStart, children }: Props) {
  // Tabs map product tracks to labels without duplicating route-level state.
  const tabs: Array<[TrackMode, string]> = [
    ['settlement', 'Settlement Lab'],
    ['trading', 'Signal Arena'],
    ['fan', 'Fan Mode']
  ]
  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">TxLINE × Solana × CoralOS</p>
          <h1>World Cup Agent Desk</h1>
          <p className="subtitle">Live sports data in. Autonomous agent decisions out. Settlement proven on Solana.</p>
          <ChainStatusStrip />
        </div>
        <button onClick={onStart}>Run agent round</button>
      </header>
      <nav className="tabs">
        {tabs.map(([value, label]) => (
          <button key={value} className={track === value ? 'active' : ''} onClick={() => setTrack(value)}>
            {label}
          </button>
        ))}
      </nav>
      {children}
    </main>
  )
}
