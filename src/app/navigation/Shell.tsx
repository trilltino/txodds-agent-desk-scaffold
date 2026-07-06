import type { TrackMode } from '../../types'
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
  // Product-track labels per the lean-track plan; the TrackMode values stay
  // stable because Rust and persisted SQLite runs serialize them.
  const tabs: Array<[TrackMode, string]> = [
    ['fan', 'Pulse Rooms'],
    ['settlement', 'Verified Markets'],
    ['trading', 'Intelligence Agent']
  ]
  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">TxLINE x Solana x Triton</p>
          <h1>World Cup Pulse Desk</h1>
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
