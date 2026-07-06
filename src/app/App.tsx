import { useEffect, useMemo, useState } from 'react'
import type { AgentRun, CoralAgentManifest, Fixture, IngestStatus, TrackMode, TxLineEvent } from '../types'
import { mockEvents } from '../core/txline/mock'
import { loadFixtureEvent, loadLiveFixtures } from '../core/txline/fixtures'
import { runLocalAgentRound } from '../core/coral/localRound'
import { fallbackCoralAgents, loadCoralAgents } from '../core/coral/agents'
import { listRunsNative, native, onIngestStatus, onTxLineEvent, runAgentRoundNative, startTxLine, stopTxLine } from '../desktop/transport'
import { Shell } from './navigation/Shell'
import { FixtureBoard } from '../features/operator/components/FixtureBoard'
import { RawTxLineFeed } from '../features/operator/components/RawTxLineFeed'
import { IntelligenceAgentScreen } from '../features/agent/components/IntelligenceAgentScreen'
import { SettlementScreen } from '../features/web3/components/SettlementScreen'
import { PulseRoomScreen } from '../features/consumer/components/PulseRoomScreen'
import { ProofDrawer } from '../features/web3/components/ProofDrawer'
import { TrackScorecard } from '../features/operator/components/TrackScorecard'

// App is the webview orchestrator: it owns selected UI state, subscribes to
// backend event streams, and delegates rendering to screens. Backend protocols
// stay behind desktop/transport.ts and src-tauri commands.
export default function App() {
  // Track determines which product lens the same TxLINE event and market run
  // are being viewed through: settlement, trading, or fan experience.
  const [track, setTrack] = useState<TrackMode>('trading')
  // Native mode is live-only: events, fixtures, and selection all start empty
  // and fill from Rust TxLINE ingest. Mock data exists solely for browser-only
  // Vite development, which has no credential-safe way to reach TxLINE.
  const [events, setEvents] = useState<TxLineEvent[]>(native ? [] : mockEvents)
  const [selectedEvent, setSelectedEvent] = useState<TxLineEvent | undefined>(native ? undefined : mockEvents[0])
  const [ingestStatuses, setIngestStatuses] = useState<IngestStatus[]>(
    native ? [] : [{ source: 'mock', state: 'connected', detail: 'Browser mock TxLINE fallback active' }]
  )
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [fixturesLoading, setFixturesLoading] = useState(native)
  const [fixturesError, setFixturesError] = useState<string>()
  const [selectedFixtureId, setSelectedFixtureId] = useState<number>()
  // Runs are newest-first because all panels render the current run by default.
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [agents, setAgents] = useState<CoralAgentManifest[]>(fallbackCoralAgents)
  const currentRun = useMemo(() => runs[0], [runs])

  async function refreshFixtures() {
    if (!native) return
    setFixturesLoading(true)
    setFixturesError(undefined)
    try {
      setFixtures(await loadLiveFixtures())
    } catch (err) {
      setFixturesError(err instanceof Error ? err.message : String(err))
    } finally {
      setFixturesLoading(false)
    }
  }

  useEffect(() => {
    // Native mode asks Rust for the agent registry; browser mode falls back to
    // the same static identities so UI iteration still works without Tauri.
    void loadCoralAgents().then(setAgents)
    if (!native) return

    // TxLINE events are pushed from Rust. Keep the list bounded so a long demo
    // session does not turn the webview into an unbounded event cache.
    const offTxLine = onTxLineEvent((event) => {
      setEvents((prev) => [event, ...prev.filter((item) => item.id !== event.id)].slice(0, 50))
      setSelectedEvent((prev) => prev ?? event)
    })
    const offIngestStatus = onIngestStatus((status) => {
      setIngestStatuses((prev) => [status, ...prev.filter((item) => item.source !== status.source)].slice(0, 6))
    })

    // Restore durable run history from SQLite, then go straight to live TxLINE.
    // There is no mock fallback: missing credentials surface as a
    // credentials_required ingest status with onboarding instructions.
    void listRunsNative().then(setRuns).catch(console.error)
    void startTxLine('live').catch(console.error)
    void refreshFixtures()

    return () => {
      offTxLine()
      offIngestStatus()
      void stopTxLine()
    }
  }, [])

  // Selecting a fixture pulls its live odds/scores snapshots from TxLINE and
  // stages them as the selected event so a round can start before the stream
  // produces the next update for that match.
  async function selectFixture(fixture: Fixture) {
    setSelectedFixtureId(fixture.fixtureId)
    try {
      const event = await loadFixtureEvent(fixture)
      setEvents((prev) => [event, ...prev.filter((item) => item.id !== event.id)].slice(0, 50))
      setSelectedEvent(event)
    } catch (err) {
      console.error('fixture snapshot failed', err)
    }
  }

  // The UI calls one function for both native and browser-dev mode. Native mode
  // executes the Rust market engine and persists to SQLite; browser mode uses
  // deterministic local fallback code.
  async function startRound(event = selectedEvent, nextTrack = track) {
    if (!event) return
    const run = native
      ? await runAgentRoundNative(event, nextTrack)
      : await runLocalAgentRound(event, nextTrack)
    setRuns((prev) => [run, ...prev])
  }

  return (
    <Shell track={track} setTrack={setTrack} onStart={() => startRound()}>
      <section className="grid two">
        <FixtureBoard
          fixtures={fixtures}
          loading={fixturesLoading}
          error={fixturesError}
          selectedFixtureId={selectedFixtureId}
          onSelect={selectFixture}
          onRefresh={() => void refreshFixtures()}
        />
        <RawTxLineFeed events={events} selected={selectedEvent} ingestStatuses={ingestStatuses} onSelect={setSelectedEvent} onStartRound={startRound} />
      </section>
      <section className="grid two">
        <IntelligenceAgentScreen agents={agents} track={track} run={currentRun} onRun={() => startRound()} />
        <SettlementScreen run={currentRun} />
      </section>
      <section className="grid two">
        <PulseRoomScreen run={currentRun} selectedEvent={selectedEvent} />
        <ProofDrawer run={currentRun} />
      </section>
      <section className="grid two">
        <TrackScorecard />
      </section>
    </Shell>
  )
}
