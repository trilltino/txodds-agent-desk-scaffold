#!/usr/bin/env node
// Read-only txoracle validation bridge.
//
// Protocol: newline-delimited JSON in/out. The bridge never sends a
// transaction. It fetches no TxLINE secrets itself; Rust supplies a complete
// proof payload and an IDL path, then this process performs Anchor `.view()`
// simulation against the txoracle program.

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { Buffer } from 'node:buffer'
import { fileURLToPath } from 'node:url'

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })

rl.on('line', async (line) => {
  if (!line.trim()) return
  try {
    const request = JSON.parse(line)
    const response = await handle(request)
    process.stdout.write(`${JSON.stringify(response)}\n`)
  } catch (err) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      status: 'failed',
      reason: err instanceof Error ? err.message : String(err)
    })}\n`)
  } finally {
    rl.close()
  }
})

rl.on('close', () => {
  process.exit(0)
})

async function handle(request) {
  if (request.cmd !== 'simulateValidateStat') {
    return failed(`unknown command: ${request.cmd}`)
  }

  const payload = request.payload ?? {}
  const missing = requiredMissing(payload, ['cluster', 'programId', 'fixtureId', 'seq', 'proof'])
  if (missing.length > 0) {
    return notStarted(`missing ${missing.join(', ')}`, { missing })
  }

  const idl = loadIdl(payload)
  if (!idl) {
    return notStarted('missing official txoracle IDL', {
      idlPath: payload.idlPath ?? null,
      cluster: payload.cluster
    })
  }
  idl.address = payload.programId

  const proof = payload.proof
  const method = chooseMethod(proof, payload.method)
  const proofHash = hashJson(proof)
  const { anchor, web3 } = await loadAnchor()
  const provider = new anchor.AnchorProvider(
    new web3.Connection(payload.rpcUrl ?? defaultRpcUrl(payload.cluster), {
      commitment: 'confirmed',
      httpHeaders: payload.rpcHeaders ?? undefined
    }),
    new ReadonlyWallet(web3),
    anchor.AnchorProvider.defaultOptions()
  )
  const program = new anchor.Program(idl, provider)

  try {
    if (method === 'validateStatV2') {
      return await validateStatV2({ anchor, web3, program, payload, proof, proofHash })
    }
    return await validateStatV1({ anchor, web3, program, payload, proof, proofHash })
  } catch (err) {
    return failed(err instanceof Error ? err.message : String(err), {
      method,
      fixtureId: payload.fixtureId,
      seq: payload.seq,
      proofHash
    })
  }
}

async function validateStatV2({ anchor, web3, program, payload, proof, proofHash }) {
  const prepared = prepareV2Payload(anchor, proof, payload.strategy)
  if (!prepared.ok) {
    return notStarted(prepared.reason, {
      method: 'validateStatV2',
      proofHash,
      missing: prepared.missing
    })
  }

  const root = await observeDailyRoot(anchor, web3, program, payload, prepared.epochDay)
  if (!root.rootPresent) {
    return notStarted('txoracle daily scores root account is not present on the selected RPC', {
      method: 'validateStatV2',
      proofHash,
      rootPda: root.rootPda.toBase58(),
      rootObservedSlot: root.rootObservedSlot
    })
  }

  const computeBudgetIx = web3.ComputeBudgetProgram.setComputeUnitLimit({
    units: 1_400_000
  })
  const isValid = await program.methods
    .validateStatV2(prepared.input, prepared.strategy)
    .accounts({
      dailyScoresMerkleRoots: root.rootPda
    })
    .preInstructions([computeBudgetIx])
    .view()

  return {
    ok: Boolean(isValid),
    status: isValid ? 'passed' : 'failed',
    verified: Boolean(isValid),
    reason: isValid
      ? 'txoracle validateStatV2 view accepted the TxLINE proof payload'
      : 'txoracle validateStatV2 view rejected the proof predicate',
    method: 'validateStatV2',
    programId: payload.programId,
    rootPda: root.rootPda.toBase58(),
    rootPresent: root.rootPresent,
    rootObservedSlot: root.rootObservedSlot,
    proofPresent: true,
    epochDay: prepared.epochDay,
    txlineTs: String(prepared.targetTs),
    merkleRoot: prepared.eventStatRoot,
    statProofHash: proofHash,
    raw: {
      method: 'validateStatV2',
      fixtureId: payload.fixtureId,
      seq: payload.seq,
      statKeys: payload.statKeys ?? [],
      predicateSource: prepared.predicateSource
    }
  }
}

async function validateStatV1({ anchor, web3, program, payload, proof, proofHash }) {
  const prepared = prepareV1Payload(anchor, proof, payload.strategy)
  if (!prepared.ok) {
    return notStarted(prepared.reason, {
      method: 'validateStat',
      proofHash,
      missing: prepared.missing
    })
  }

  const root = await observeDailyRoot(anchor, web3, program, payload, prepared.epochDay)
  if (!root.rootPresent) {
    return notStarted('txoracle daily scores root account is not present on the selected RPC', {
      method: 'validateStat',
      proofHash,
      rootPda: root.rootPda.toBase58(),
      rootObservedSlot: root.rootObservedSlot
    })
  }

  const computeBudgetIx = web3.ComputeBudgetProgram.setComputeUnitLimit({
    units: 1_400_000
  })
  const isValid = await program.methods
    .validateStat(
      prepared.ts,
      prepared.fixtureSummary,
      prepared.fixtureProof,
      prepared.mainTreeProof,
      prepared.predicate,
      prepared.statA,
      null,
      null
    )
    .accounts({
      dailyScoresMerkleRoots: root.rootPda
    })
    .preInstructions([computeBudgetIx])
    .view()

  return {
    ok: Boolean(isValid),
    status: isValid ? 'passed' : 'failed',
    verified: Boolean(isValid),
    reason: isValid
      ? 'txoracle validateStat view accepted the TxLINE proof payload'
      : 'txoracle validateStat view rejected the proof predicate',
    method: 'validateStat',
    programId: payload.programId,
    rootPda: root.rootPda.toBase58(),
    rootPresent: root.rootPresent,
    rootObservedSlot: root.rootObservedSlot,
    proofPresent: true,
    epochDay: prepared.epochDay,
    txlineTs: String(prepared.targetTs),
    merkleRoot: prepared.eventStatRoot,
    statProofHash: proofHash,
    raw: {
      method: 'validateStat',
      fixtureId: payload.fixtureId,
      seq: payload.seq,
      statKeys: payload.statKeys ?? [],
      predicateSource: prepared.predicateSource
    }
  }
}

function prepareV2Payload(anchor, proof, suppliedStrategy) {
  const val = proof.validation ?? proof
  const missing = missingV2Fields(val)
  if (missing.length > 0) {
    return { ok: false, reason: `TxLINE V2 proof payload missing ${missing.join(', ')}`, missing }
  }

  const targetTs = asNumber(val.summary.updateStats.minTimestamp)
  const stats = val.statsToProve.map((statObj, index) => ({
    stat: normalizeScoreStat(statObj),
    statProof: toProofNodes(val.statProofs[index] ?? [])
  }))
  if (stats.length === 0) {
    return { ok: false, reason: 'TxLINE V2 proof payload has no statsToProve', missing: ['statsToProve'] }
  }

  const strategy = normalizeStrategy(suppliedStrategy) ?? exactValueStrategy(stats)
  const eventStatRoot = bytes32Hex(val.eventStatRoot)
  return {
    ok: true,
    targetTs,
    epochDay: epochDayFromTimestamp(targetTs),
    eventStatRoot,
    predicateSource: suppliedStrategy ? 'request.strategy' : 'proof.exact_value',
    input: {
      ts: new anchor.BN(String(targetTs)),
      fixtureSummary: {
        fixtureId: new anchor.BN(String(val.summary.fixtureId)),
        updateStats: {
          updateCount: asNumber(val.summary.updateStats.updateCount),
          minTimestamp: new anchor.BN(String(val.summary.updateStats.minTimestamp)),
          maxTimestamp: new anchor.BN(String(val.summary.updateStats.maxTimestamp))
        },
        eventsSubTreeRoot: toBytes32(val.summary.eventStatsSubTreeRoot)
      },
      fixtureProof: toProofNodes(val.subTreeProof),
      mainTreeProof: toProofNodes(val.mainTreeProof),
      eventStatRoot: toBytes32(val.eventStatRoot),
      stats
    },
    strategy
  }
}

function prepareV1Payload(anchor, proof, suppliedStrategy) {
  const val = proof.validation ?? proof
  const missing = missingV1Fields(val)
  if (missing.length > 0) {
    return { ok: false, reason: `TxLINE V1 proof payload missing ${missing.join(', ')}`, missing }
  }

  const targetTs = asNumber(val.summary.updateStats.minTimestamp)
  const stat = normalizeScoreStat(val.statToProve)
  const predicate = normalizePredicate(suppliedStrategy?.predicate) ?? {
    threshold: stat.value,
    comparison: { equalTo: {} }
  }
  const eventStatRoot = bytes32Hex(val.eventStatRoot)
  return {
    ok: true,
    targetTs,
    epochDay: epochDayFromTimestamp(targetTs),
    eventStatRoot,
    predicateSource: suppliedStrategy?.predicate ? 'request.strategy.predicate' : 'proof.exact_value',
    ts: new anchor.BN(String(targetTs)),
    fixtureSummary: {
      fixtureId: new anchor.BN(String(val.summary.fixtureId)),
      updateStats: {
        updateCount: asNumber(val.summary.updateStats.updateCount),
        minTimestamp: new anchor.BN(String(val.summary.updateStats.minTimestamp)),
        maxTimestamp: new anchor.BN(String(val.summary.updateStats.maxTimestamp))
      },
      eventsSubTreeRoot: toBytes32(val.summary.eventStatsSubTreeRoot)
    },
    fixtureProof: toProofNodes(val.subTreeProof),
    mainTreeProof: toProofNodes(val.mainTreeProof),
    predicate,
    statA: {
      statToProve: stat,
      eventStatRoot: toBytes32(val.eventStatRoot),
      statProof: toProofNodes(val.statProof)
    }
  }
}

async function observeDailyRoot(anchor, web3, program, payload, epochDay) {
  const [rootPda] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from('daily_scores_roots'),
      new anchor.BN(epochDay).toArrayLike(Buffer, 'le', 2)
    ],
    program.programId
  )
  const account = await program.provider.connection.getAccountInfoAndContext(rootPda, 'confirmed')
  return {
    rootPda,
    rootPresent: account.value !== null,
    rootObservedSlot: account.context?.slot ?? null
  }
}

async function loadAnchor() {
  const anchor = await import('@coral-xyz/anchor')
  const web3 = await import('@solana/web3.js')
  return { anchor, web3 }
}

class ReadonlyWallet {
  constructor(web3) {
    this.keypair = web3.Keypair.generate()
    this.publicKey = this.keypair.publicKey
  }

  async signTransaction() {
    throw new Error('txoracle validation bridge is read-only')
  }

  async signAllTransactions() {
    throw new Error('txoracle validation bridge is read-only')
  }
}

function loadIdl(payload) {
  if (payload.idl) return payload.idl
  if (payload.idlPath && fs.existsSync(payload.idlPath)) {
    return JSON.parse(fs.readFileSync(payload.idlPath, 'utf8'))
  }

  const fallback = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'vendor',
    'tx-on-chain',
    'idl',
    payload.cluster === 'mainnet' ? 'txoracle.mainnet.json' : 'txoracle.devnet.json'
  )
  if (fs.existsSync(fallback)) {
    return JSON.parse(fs.readFileSync(fallback, 'utf8'))
  }
  return null
}

function chooseMethod(proof, requested) {
  if (requested === 'validateStat' || requested === 'validateStatV1') return 'validateStat'
  if (requested === 'validateStatV2') return 'validateStatV2'
  const val = proof?.validation ?? proof
  return Array.isArray(val?.statsToProve) ? 'validateStatV2' : 'validateStat'
}

function missingV2Fields(val) {
  const missing = []
  if (!val?.summary) missing.push('summary')
  if (val?.summary && val.summary.fixtureId === undefined) missing.push('summary.fixtureId')
  if (!val?.summary?.updateStats) missing.push('summary.updateStats')
  if (val?.summary?.updateStats && val.summary.updateStats.minTimestamp === undefined) missing.push('summary.updateStats.minTimestamp')
  if (val?.summary?.updateStats && val.summary.updateStats.maxTimestamp === undefined) missing.push('summary.updateStats.maxTimestamp')
  if (val?.summary?.updateStats && val.summary.updateStats.updateCount === undefined) missing.push('summary.updateStats.updateCount')
  if (val?.summary && val.summary.eventStatsSubTreeRoot === undefined) missing.push('summary.eventStatsSubTreeRoot')
  if (!Array.isArray(val?.subTreeProof)) missing.push('subTreeProof')
  if (!Array.isArray(val?.mainTreeProof)) missing.push('mainTreeProof')
  if (val?.eventStatRoot === undefined) missing.push('eventStatRoot')
  if (!Array.isArray(val?.statsToProve)) missing.push('statsToProve')
  if (!Array.isArray(val?.statProofs)) missing.push('statProofs')
  return missing
}

function missingV1Fields(val) {
  const missing = []
  if (!val?.summary) missing.push('summary')
  if (val?.summary && val.summary.fixtureId === undefined) missing.push('summary.fixtureId')
  if (!val?.summary?.updateStats) missing.push('summary.updateStats')
  if (val?.summary?.updateStats && val.summary.updateStats.minTimestamp === undefined) missing.push('summary.updateStats.minTimestamp')
  if (val?.summary?.updateStats && val.summary.updateStats.maxTimestamp === undefined) missing.push('summary.updateStats.maxTimestamp')
  if (val?.summary?.updateStats && val.summary.updateStats.updateCount === undefined) missing.push('summary.updateStats.updateCount')
  if (val?.summary && val.summary.eventStatsSubTreeRoot === undefined) missing.push('summary.eventStatsSubTreeRoot')
  if (!Array.isArray(val?.subTreeProof)) missing.push('subTreeProof')
  if (!Array.isArray(val?.mainTreeProof)) missing.push('mainTreeProof')
  if (val?.eventStatRoot === undefined) missing.push('eventStatRoot')
  if (!val?.statToProve) missing.push('statToProve')
  if (!Array.isArray(val?.statProof)) missing.push('statProof')
  return missing
}

function normalizeScoreStat(statObj) {
  const stat = statObj?.stat ?? statObj
  return {
    key: asNumber(stat.key ?? stat.statKey ?? stat.stat_key),
    value: asNumber(stat.value),
    period: asNumber(stat.period ?? 0)
  }
}

function normalizeStrategy(strategy) {
  if (!strategy) return null
  return {
    geometricTargets: strategy.geometricTargets ?? [],
    distancePredicate: strategy.distancePredicate ? normalizePredicate(strategy.distancePredicate) : null,
    discretePredicates: (strategy.discretePredicates ?? []).map((predicate) => {
      if (predicate.single) {
        return {
          single: {
            index: asNumber(predicate.single.index),
            predicate: normalizePredicate(predicate.single.predicate)
          }
        }
      }
      if (predicate.binary) {
        return {
          binary: {
            indexA: asNumber(predicate.binary.indexA ?? predicate.binary.index_a),
            indexB: asNumber(predicate.binary.indexB ?? predicate.binary.index_b),
            op: predicate.binary.op ?? { subtract: {} },
            predicate: normalizePredicate(predicate.binary.predicate)
          }
        }
      }
      return predicate
    })
  }
}

function exactValueStrategy(stats) {
  return {
    geometricTargets: [],
    distancePredicate: null,
    discretePredicates: stats.map((item, index) => ({
      single: {
        index,
        predicate: {
          threshold: item.stat.value,
          comparison: { equalTo: {} }
        }
      }
    }))
  }
}

function normalizePredicate(predicate) {
  if (!predicate) return null
  return {
    threshold: asNumber(predicate.threshold),
    comparison: predicate.comparison ?? { equalTo: {} }
  }
}

function toProofNodes(nodes) {
  return (nodes ?? []).map((node) => ({
    hash: toBytes32(node.hash),
    isRightSibling: Boolean(node.isRightSibling ?? node.is_right_sibling)
  }))
}

function toBytes32(value) {
  const bytes = bytesFrom(value)
  if (bytes.length !== 32) {
    throw new Error(`expected 32 bytes, received ${bytes.length}`)
  }
  return Array.from(bytes)
}

function bytes32Hex(value) {
  return `0x${Buffer.from(toBytes32(value)).toString('hex')}`
}

function bytesFrom(value) {
  if (Array.isArray(value)) return Uint8Array.from(value)
  if (value instanceof Uint8Array) return value
  if (typeof value !== 'string') {
    throw new Error(`unsupported byte value ${typeof value}`)
  }
  if (value.startsWith('0x')) return Buffer.from(value.slice(2), 'hex')
  return Buffer.from(value, 'base64')
}

function epochDayFromTimestamp(timestamp) {
  return Math.floor(timestamp / 86_400_000)
}

function asNumber(value) {
  const next = Number(value)
  if (!Number.isFinite(next)) {
    throw new Error(`expected finite number, received ${value}`)
  }
  return next
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex')
}

function defaultRpcUrl(cluster) {
  return cluster === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com'
}

function requiredMissing(payload, keys) {
  return keys.filter((key) => payload[key] === undefined || payload[key] === null || payload[key] === '')
}

function notStarted(reason, raw = {}) {
  return { ok: false, status: 'not_started', verified: false, reason, raw }
}

function failed(reason, raw = {}) {
  return { ok: false, status: 'failed', verified: false, reason, raw }
}
