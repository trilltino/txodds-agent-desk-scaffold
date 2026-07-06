import { useEffect, useMemo, useState } from 'react'
import type {
  AgentRun,
  AgentTraceEvent,
  CoralAgentManifest,
  CoralMessage,
  Fixture,
  IngestStatus,
  TrackMode,
  TxLineEvent,
  TxLineProofReceipt,
  UserAppPage
} from '../types'
import { loadFixtureEvent, loadLiveFixtures } from '../core/txline/fixtures'
import { loadCoralAgents } from '../core/coral/agents'
import {
  listAgentTraceNative,
  listCoralMessagesNative,
  listRunsNative,
  native,
  onAgentTrace,
  onCoralMessage,
  onIngestStatus,
  onProofReceipt,
  onTxLineEvent,
  runAgentRoundNative,
  startTxLine,
  stopTxLine
} from '../desktop/transport'
import { Shell } from './navigation/Shell'
import { FixtureBoard } from '../features/operator/components/FixtureBoard'
import { RawTxLineFeed } from '../features/operator/components/RawTxLineFeed'
import { IntelligenceAgentScreen } from '../features/agent/components/IntelligenceAgentScreen'
import { SettlementScreen } from '../features/web3/components/SettlementScreen'
import { PulseRoomScreen } from '../features/consumer/components/PulseRoomScreen'
import { ProofDrawer } from '../features/web3/components/ProofDrawer'
import { TrackScorecard } from '../features/operator/components/TrackScorecard'
import { CoralTranscript } from '../features/coral/components/CoralTranscript'
import { AgentTracePanel } from '../features/agent/components/AgentTracePanel'
import { PhantomConnectButton } from '../features/wallet/components/PhantomConnectButton'
import { SolanaPayCheckout } from '../features/wallet/components/SolanaPayCheckout'

const pageTracks: Record<UserAppPage, TrackMode> = {
  pulse: 'fan',
  markets: 'settlement',
  agent: 'trading'
}

const pageMeta: Record<UserAppPage, { eyebrow: string; title: string }> = {
  pulse: { eyebrow: 'Consumer app', title: 'Pulse Rooms' },
  markets: { eyebrow: 'Web3 app', title: 'Verified Markets' },
  agent: { eyebrow: 'Agent app', title: 'Intelligence Agent' }
}

function pageFromHash(): UserAppPage {
  const hash = window.location.hash.replace('#', '')
  return hash === 'markets' || hash === 'agent' || hash === 'pulse' ? hash : 'pulse'
}

function DesktopOnlyScreen() {
  return (
    <main className="desktopOnly">
      <div className="desktopOnlyPanel">
        <span className="worldCupMark" aria-hidden="true"><span /></span>
        <div>
          <p className="eyebrow">Desktop runtime required</p>
          <h1>World Cup Agent Desk</h1>
          <p>This app runs only as the Tauri desktop client with Rust-owned live TxLINE credentials.</p>
        </div>
      </div>
    </main>
  )
}

// App is the webview orchestrator: it owns selected UI state, subscribes to
// backend event streams, and delegates rendering to screens. Backend protocols
// stay behind desktop/transport.ts and src-tauri commands.
export default function App() {
  if (!native) return <DesktopOnlyScreen />

  const [page, setPage] = useState<UserAppPage>(pageFromHash)
  const track = pageTracks[page]
  // Desktop mode is live-only: events, fixtures, and selection all start empty
  // and fill from Rust TxLINE ingest. Browser rendering is blocked above.
  const [events, setEvents] = useState<TxLineEvent[]>([])
  const [selectedEvent, setSelectedEvent] = useState<TxLineEvent | undefined>()
  const [ingestStatuses, setIngestStatuses] = useState<IngestStatus[]>([])
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [fixturesLoading, setFixturesLoading] = useState(true)
  const [fixturesError, setFixturesError] = useState<string>()
  const [selectedFixtureId, setSelectedFixtureId] = useState<number>()
  // Runs are newest-first because all panels render the current run by default.
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [agents, setAgents] = useState<CoralAgentManifest[]>([])
  const [coralMessages, setCoralMessages] = useState<CoralMessage[]>([])
  const [agentTrace, setAgentTrace] = useState<AgentTraceEvent[]>([])
  const [proofReceipts, setProofReceipts] = useState<TxLineProofReceipt[]>([])
  const currentRun = useMemo(() => runs.find((run) => run.track === track) ?? runs[0], [runs, track])
  const selectedMeta = pageMeta[page]
  const currentProof = useMemo(() => {
    if (!currentRun) return proofReceipts[0]
    return proofReceipts.find((proof) => proof.fixtureId === currentRun.trigger.fixtureId && proof.seq === currentRun.trigger.seq)
      ?? currentRun.trigger.proof
      ?? proofReceipts[0]
  }, [currentRun, proofReceipts])
  const currentRunMessages = useMemo(() => {
    if (!currentRun) return coralMessages
    return coralMessages.filter((message) => message.sessionId.includes(currentRun.runId))
  }, [coralMessages, currentRun])
  const currentRunTrace = useMemo(() => {
    if (!currentRun) return agentTrace
    return agentTrace.filter((trace) => trace.runId === currentRun.runId)
  }, [agentTrace, currentRun])

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  async function refreshFixtures() {
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
    // Desktop mode asks Rust for the agent registry so UI and backend agree on
    // active identities.
    void loadCoralAgents().then(setAgents)

    // TxLINE events are pushed from Rust. Keep the list bounded so a long demo
    // session does not turn the webview into an unbounded event cache.
    const offTxLine = onTxLineEvent((event) => {
      setEvents((prev) => [event, ...prev.filter((item) => item.id !== event.id)].slice(0, 50))
      setSelectedEvent((prev) => prev ?? event)
    })
    const offIngestStatus = onIngestStatus((status) => {
      setIngestStatuses((prev) => [status, ...prev.filter((item) => item.source !== status.source)].slice(0, 6))
    })
    const offCoralMessage = onCoralMessage((message) => {
      setCoralMessages((prev) => [...prev.filter((item) => item.id !== message.id), message].slice(-120))
    })
    const offAgentTrace = onAgentTrace((trace) => {
      setAgentTrace((prev) => [...prev.filter((item) => item.id !== trace.id), trace].slice(-120))
    })
    const offProofReceipt = onProofReceipt((proof) => {
      setProofReceipts((prev) => [proof, ...prev.filter((item) => !(item.fixtureId === proof.fixtureId && item.seq === proof.seq))].slice(0, 40))
    })

    // Restore durable run history from SQLite, then go straight to live TxLINE.
    // There is no non-live fallback: missing credentials surface as a
    // credentials_required ingest status with onboarding instructions.
    void listRunsNative().then(setRuns).catch(console.error)
    void startTxLine().catch(console.error)
    void refreshFixtures()

    return () => {
      offTxLine()
      offIngestStatus()
      offCoralMessage()
      offAgentTrace()
      offProofReceipt()
      void stopTxLine()
    }
  }, [])

  useEffect(() => {
    if (!currentRun) return
    void listCoralMessagesNative(currentRun.runId)
      .then((messages) => {
        if (messages.length > 0) setCoralMessages((prev) => [...prev, ...messages].slice(-120))
      })
      .catch(console.error)
    void listAgentTraceNative(currentRun.runId)
      .then((trace) => {
        if (trace.length > 0) setAgentTrace((prev) => [...prev, ...trace].slice(-120))
      })
      .catch(console.error)
  }, [currentRun?.runId])

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

  // The UI can only execute native Rust rounds; browser-local rounds are
  // intentionally unavailable in this desktop-only app.
  async function startRound(event = selectedEvent, nextTrack = track) {
    if (!event) return
    const run = await runAgentRoundNative(event, nextTrack)
    setRuns((prev) => [run, ...prev])
  }

  return (
    <Shell page={page} setPage={setPage} onStart={() => startRound()}>
      <section className={`productPage ${page}`}>
        <div className="pageTitle">
          <div className="titleCopy">
            <p className="eyebrow">{selectedMeta.eyebrow}</p>
            <h2>{selectedMeta.title}</h2>
          </div>
          <div className="matchRibbon" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className="pageStatus">{selectedEvent ? `fixture ${selectedEvent.fixtureId}` : 'waiting for TxLINE'}</span>
        </div>
        <div className="pageGrid">
          <div className="pageMain">
            {page === 'pulse' ? (
              <>
                <PulseRoomScreen run={currentRun} selectedEvent={selectedEvent} />
                <CoralTranscript messages={currentRunMessages} />
              </>
            ) : page === 'markets' ? (
              <>
                <SettlementScreen run={currentRun} />
                <SolanaPayCheckout run={currentRun} />
                <ProofDrawer run={currentRun} proof={currentProof} />
                <PhantomConnectButton />
                <CoralTranscript messages={currentRunMessages} />
              </>
            ) : (
              <>
                <IntelligenceAgentScreen agents={agents} track={track} run={currentRun} onRun={() => startRound()} />
                <AgentTracePanel trace={currentRunTrace} />
                <CoralTranscript messages={currentRunMessages} />
                <TrackScorecard />
              </>
            )}
          </div>
          <aside className="contextRail">
            <FixtureBoard
              fixtures={fixtures}
              loading={fixturesLoading}
              error={fixturesError}
              selectedFixtureId={selectedFixtureId}
              onSelect={selectFixture}
              onRefresh={() => void refreshFixtures()}
            />
            <RawTxLineFeed
              events={events}
              selected={selectedEvent}
              ingestStatuses={ingestStatuses}
              onSelect={setSelectedEvent}
              onStartRound={(event) => startRound(event)}
            />
          </aside>
        </div>
      </section>
    </Shell>
  )
}
