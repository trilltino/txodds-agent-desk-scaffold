// CoralOS settlement bridge sidecar.
//
// Rust sends one NDJSON request on stdin and expects one normalized JSON response
// on stdout. Diagnostic output should stay off stdout so Rust can parse reliably.

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

// Default local TxODDS proxy from the solana_coralOS example app.
const DEFAULT_PROXY = 'http://localhost:8801'

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

// Process every incoming line independently so Rust can keep the protocol simple
// and versionable.
for await (const line of rl) {
  if (!line.trim()) continue
  try {
    const request = JSON.parse(line)
    const response = await handle(request)
    console.log(JSON.stringify(response))
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: err?.message ?? String(err) }))
  }
}

async function handle(request) {
  // This sidecar currently has one command. Future commands should be explicit
  // rather than overloading request payload shape.
  if (request.cmd !== 'settleRun') return { ok: false, error: `unknown command: ${request.cmd}` }
  const cfg = request.payload?.coralos ?? {}

  // A custom bridge URL wins when provided, which lets users replace the bundled
  // proxy adapter with a real CoralOS service.
  if (cfg.bridgeUrl) {
    return settleViaBridge(cfg.bridgeUrl, request)
  }

  // Fallback to the TxODDS proxy from solana_coralOS.
  const proxyUrl = cfg.proxyUrl || process.env.CORALOS_TXODDS_PROXY || DEFAULT_PROXY
  if (process.env.CORALOS_AUTOSTART_PROXY === '1' && cfg.root) {
    await ensureProxy(cfg.root, proxyUrl)
  }

  return settleViaProxy(proxyUrl, request)
}

async function settleViaBridge(bridgeUrl, request) {
  // Custom bridge mode posts the full run context, then attempts release against
  // the returned round id.
  const base = bridgeUrl.replace(/\/$/, '')
  const round = await fetchJson(`${base}/rounds`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      runId: request.runId,
      fixtureId: request.fixtureId,
      amountSol: request.amountSol,
      reference: request.reference,
      payload: request.payload,
    }),
  })

  const id = round.runId ?? round.id ?? request.runId
  let release = {}
  try {
    release = await fetchJson(`${base}/settlement/${encodeURIComponent(id)}/release`, { method: 'POST' })
  } catch (err) {
    release = { ok: false, error: err.message }
  }

  return normalizeSettlement({ ...round, release }, round)
}

async function settleViaProxy(proxyUrl, request) {
  // TxODDS proxy mode uses the existing demo route and maps its response into
  // the normalized receipt Rust expects.
  const base = proxyUrl.replace(/\/$/, '')
  const url = new URL(`${base}/api/settle`)
  url.searchParams.set('amount', String(request.amountSol || 0.001))
  url.searchParams.set('fixtureId', String(request.fixtureId || ''))
  const result = await fetchJson(url)
  return normalizeSettlement(result, result)
}

function normalizeSettlement(result, raw) {
  // Support multiple response spellings from bridge/proxy experiments while
  // returning one stable Rust-facing shape.
  const open = result.open ?? result.deposit ?? {}
  const release = result.release ?? {}
  const escrow = result.escrow ?? {}
  const depositSig = open.sig ?? result.depositSig ?? result.deposit_tx
  const releaseSig = release.sig ?? result.releaseSig ?? result.release_tx
  const escrowPda = escrow.pda ?? result.escrowPda ?? result.escrow_pda

  return {
    ok: result.ok !== false && !result.error,
    mode: result.mode ?? 'coralos',
    error: result.error,
    reference: result.reference,
    buyer: result.buyer,
    seller: result.seller,
    escrowPda,
    depositSig,
    releaseSig,
    explorerUrl: release.explorer ?? open.explorer ?? escrow.explorer ?? result.explorerUrl,
    raw,
  }
}

async function ensureProxy(root, proxyUrl) {
  // Local convenience path: if the CoralOS example proxy is not running, start it
  // detached and wait for its board endpoint to become healthy.
  if (await healthy(proxyUrl)) return

  const txoddsDir = `${root.replace(/\/$/, '')}/examples/txodds`
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'proxy'], {
    cwd: txoddsDir,
    env: { ...process.env },
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  const deadline = Date.now() + 25_000
  while (Date.now() < deadline) {
    if (await healthy(proxyUrl)) return
    await delay(750)
  }
  throw new Error(`TxODDS proxy did not become healthy at ${proxyUrl}`)
}

async function healthy(proxyUrl) {
  // A fast health probe keeps autostart from blindly spawning duplicate proxies.
  try {
    const res = await fetch(`${proxyUrl.replace(/\/$/, '')}/api/board`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

async function fetchJson(url, init) {
  // Centralized fetch wrapper adds a timeout and tolerant JSON/text handling so
  // errors return useful messages to Rust.
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { rawText: text }
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
  return body
}

// Sleep helper used by proxy startup polling.
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
