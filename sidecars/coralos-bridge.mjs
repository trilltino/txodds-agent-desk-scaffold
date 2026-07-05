import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

const DEFAULT_PROXY = 'http://localhost:8801'

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

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
  if (request.cmd !== 'settleRun') return { ok: false, error: `unknown command: ${request.cmd}` }
  const cfg = request.payload?.coralos ?? {}

  if (cfg.bridgeUrl) {
    return settleViaBridge(cfg.bridgeUrl, request)
  }

  const proxyUrl = cfg.proxyUrl || process.env.CORALOS_TXODDS_PROXY || DEFAULT_PROXY
  if (process.env.CORALOS_AUTOSTART_PROXY === '1' && cfg.root) {
    await ensureProxy(cfg.root, proxyUrl)
  }

  return settleViaProxy(proxyUrl, request)
}

async function settleViaBridge(bridgeUrl, request) {
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
  const base = proxyUrl.replace(/\/$/, '')
  const url = new URL(`${base}/api/settle`)
  url.searchParams.set('amount', String(request.amountSol || 0.001))
  url.searchParams.set('fixtureId', String(request.fixtureId || ''))
  const result = await fetchJson(url)
  return normalizeSettlement(result, result)
}

function normalizeSettlement(result, raw) {
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
  try {
    const res = await fetch(`${proxyUrl.replace(/\/$/, '')}/api/board`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

async function fetchJson(url, init) {
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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
