import { mockEvents, mockFixtures } from './mock'
import type { Fixture, TxLineEvent } from '../../types'

// Browser fallback config. Production desktop mode keeps these credentials in
// Rust config/keyring and never exposes them to JavaScript.
export interface TxLineConfig {
  apiOrigin: string
  jwt: string
  apiToken: string
  network: 'devnet' | 'mainnet'
}

// Header helper exists only for browser-dev fallback requests.
function headers(cfg: TxLineConfig): HeadersInit {
  return {
    Authorization: `Bearer ${cfg.jwt}`,
    'X-Api-Token': cfg.apiToken,
    'Content-Type': 'application/json'
  }
}

// Return mock fixtures unless all credentials are present. That keeps plain Vite
// dev mode useful without requiring TxLINE access.
export async function fetchFixtures(cfg?: Partial<TxLineConfig>): Promise<Fixture[]> {
  if (!cfg?.jwt || !cfg?.apiToken || !cfg?.apiOrigin) return mockFixtures
  const res = await fetch(`${cfg.apiOrigin}/api/scores/schedule`, { headers: headers(cfg as TxLineConfig) })
  if (!res.ok) throw new Error(`TxLINE fixtures failed: ${res.status}`)
  return res.json()
}

// Snapshot helper mirrors the live API shape while still allowing offline UI
// development from mock data.
export async function fetchScoresSnapshot(fixtureId: number, cfg?: Partial<TxLineConfig>) {
  if (!cfg?.jwt || !cfg?.apiToken || !cfg?.apiOrigin) return mockEvents.find((e) => e.fixtureId === fixtureId)?.score ?? null
  const res = await fetch(`${cfg.apiOrigin}/api/scores/snapshot/${fixtureId}?asOf=${Date.now()}`, { headers: headers(cfg as TxLineConfig) })
  if (!res.ok) throw new Error(`TxLINE scores snapshot failed: ${res.status}`)
  return res.json()
}

// Browser SSE parser retained for development only. Native production uses
// src-tauri/src/txline/ingest.rs for SSE so tokens stay backend-side.
export async function streamTxLineEvents(
  cfg: TxLineConfig,
  stream: 'odds' | 'scores',
  onEvent: (event: TxLineEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const streamUrl = `${cfg.apiOrigin}/api/${stream}/stream`
  const res = await fetch(streamUrl, {
    headers: { ...headers(cfg), Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
    signal
  })
  if (!res.ok || !res.body) throw new Error(`TxLINE ${stream} stream failed: ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // SSE events are separated by a blank line. Keep the unfinished tail in
    // buffer so chunk boundaries do not corrupt JSON payloads.
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const dataLine = block.split(/\r?\n/).find((line) => line.startsWith('data:'))
      if (!dataLine) continue
      // The fallback normalizes arbitrary TxLINE payloads into the shared event
      // shape expected by LiveFeed and agent rounds.
      const data = JSON.parse(dataLine.replace(/^data:\s?/, ''))
      onEvent({
        id: `${stream}-${Date.now()}`,
        kind: stream === 'odds' ? 'odds_update' : 'score_update',
        fixtureId: Number(data.fixtureId ?? data.id ?? 0),
        title: `${stream} update`,
        body: 'Live TxLINE SSE event received',
        ts: new Date().toISOString(),
        raw: data
      })
    }
  }
}
