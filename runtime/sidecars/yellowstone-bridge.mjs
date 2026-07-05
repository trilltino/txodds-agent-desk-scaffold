// Yellowstone gRPC sidecar.
//
// Rust supervises this process and sends watch updates over stdin. The sidecar
// owns Triton's Node SDK stream and writes normalized JSON events to stdout.

import { createInterface } from 'node:readline'
import Client, { CommitmentLevel } from '@triton-one/yellowstone-grpc'
import bs58 from 'bs58'

// Credentials/config are provided by Rust as child-process environment values.
const endpoint = process.env.TRITON_GRPC_ENDPOINT
const token = process.env.TRITON_X_TOKEN

// Initial filters can come from env; runtime additions come from stdin commands.
const accounts = new Set(splitEnv('WATCH_ESCROW_ACCOUNT'))
const txAccounts = new Set([
  ...splitEnv('WATCH_ESCROW_PROGRAM_ID'),
  ...splitEnv('WATCH_MARKET_PROGRAM_ID'),
])

let reconnectTimer
let reconnectDelayMs = 1000
let stream

// Top-level errors are serialized to stdout so Rust can emit a status event.
main().catch((err) => {
  emit({ event: 'status', state: 'stopped', detail: err?.message ?? String(err) })
  process.exitCode = 1
})

async function main() {
  if (!endpoint) throw new Error('TRITON_GRPC_ENDPOINT missing')
  if (!token) throw new Error('TRITON_X_TOKEN missing')

  await connectStream()

  // Stdin accepts both serde enum shapes from Rust and simpler command aliases
  // to make manual debugging easy.
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    try {
      const command = JSON.parse(line)
      if (command.watchAccount?.account) accounts.add(command.watchAccount.account)
      if (command.watchProgram?.programId) txAccounts.add(command.watchProgram.programId)
      if (command.watchReference?.reference) txAccounts.add(command.watchReference.reference)
      if (command.account) accounts.add(command.account)
      if (command.programId) txAccounts.add(command.programId)
      if (command.reference) txAccounts.add(command.reference)
      await writeRequest(buildRequest())
      emit({ event: 'status', state: 'connected', detail: 'Yellowstone subscription filters updated' })
    } catch (err) {
      emit({ event: 'status', state: 'connected', detail: `ignored command: ${err?.message ?? String(err)}` })
    }
  }
}

async function connectStream() {
  // Recreate the client/stream on every reconnect. The Triton SDK owns the gRPC
  // transport details below this point.
  emit({ event: 'status', state: 'connecting', detail: "connecting to Triton Dragon's Mouth" })
  const client = new Client(endpoint, token, {
    'grpc.max_receive_message_length': 64 * 1024 * 1024,
    'grpc.max_send_message_length': 16 * 1024 * 1024,
  })

  stream = await client.subscribe()
  // All stream lifecycle events funnel into scheduleReconnect so Rust sees a
  // consistent reconnecting status.
  stream.on('data', handleUpdate)
  stream.on('error', (err) => {
    emit({ event: 'status', state: 'reconnecting', detail: err?.message ?? String(err) })
    scheduleReconnect()
  })
  stream.on('close', () => {
    emit({ event: 'status', state: 'reconnecting', detail: 'Yellowstone stream closed' })
    scheduleReconnect()
  })
  stream.on('end', () => {
    emit({ event: 'status', state: 'reconnecting', detail: 'Yellowstone stream ended' })
    scheduleReconnect()
  })

  await writeRequest(buildRequest())
  reconnectDelayMs = 1000
  emit({ event: 'status', state: 'connected', detail: 'Yellowstone gRPC stream connected' })
}

function scheduleReconnect() {
  // Exponential backoff avoids tight reconnect loops during network loss.
  stream = undefined
  if (reconnectTimer) return
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = undefined
    try {
      await connectStream()
    } catch (err) {
      emit({ event: 'status', state: 'reconnecting', detail: err?.message ?? String(err) })
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000)
      scheduleReconnect()
    }
  }, reconnectDelayMs)
}

function buildRequest() {
  // Subscribe to slots by default so the UI has a live chain heartbeat even
  // before settlement accounts/programs are known.
  const request = {
    slots: { desk: { filterByCommitment: false, interslotUpdates: true } },
    accounts: {},
    transactions: {},
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    accountsDataSlice: [],
    commitment: CommitmentLevel.CONFIRMED,
  }
  if (accounts.size) {
    // Account filters watch specific escrow/account pubkeys.
    request.accounts.deskAccounts = {
      account: [...accounts],
      owner: [],
      filters: [],
      nonemptyTxnSignature: false,
    }
  }
  if (txAccounts.size) {
    // Transaction filters watch program ids or reference-related accounts.
    request.transactions.deskTransactions = {
      vote: false,
      failed: false,
      accountInclude: [...txAccounts],
      accountExclude: [],
      accountRequired: [],
    }
  }
  return request
}

function handleUpdate(data) {
  // Each Yellowstone payload variant is normalized into a compact event object.
  if (data.slot) {
    emit({ event: 'slot', slot: Number(data.slot.slot), status: data.slot.status, parent: data.slot.parent })
    return
  }

  if (data.account?.account) {
    // Protobuf bytes are encoded as base58 so Rust/React can display addresses
    // without knowing SDK internals.
    const account = data.account.account
    emit({
      event: 'account',
      payload: {
        account: encodeBytes(account.pubkey),
        owner: encodeBytes(account.owner),
        lamports: Number(account.lamports ?? 0),
        slot: Number(data.account.slot ?? 0),
        dataLen: byteLength(account.data),
        txnSignature: account.txnSignature ? encodeBytes(account.txnSignature) : undefined,
        ts: new Date().toISOString(),
      },
    })
    return
  }

  if (data.transaction?.transaction) {
    // Transaction updates surface signatures and errors; deeper transaction
    // decoding can be added later when the watched programs are finalized.
    const tx = data.transaction.transaction
    emit({
      event: 'tx',
      payload: {
        signature: encodeBytes(tx.signature),
        slot: Number(data.transaction.slot ?? 0),
        isVote: !!tx.isVote,
        index: Number(tx.index ?? 0),
        err: tx.meta?.err ? JSON.stringify(tx.meta.err) : undefined,
        ts: new Date().toISOString(),
      },
    })
    return
  }

  if (data.transactionStatus) {
    emit({
      event: 'tx',
      payload: {
        signature: encodeBytes(data.transactionStatus.signature),
        slot: Number(data.transactionStatus.slot ?? 0),
        isVote: !!data.transactionStatus.isVote,
        index: Number(data.transactionStatus.index ?? 0),
        err: data.transactionStatus.err ? JSON.stringify(data.transactionStatus.err) : undefined,
        ts: new Date().toISOString(),
      },
    })
  }
}

async function writeRequest(request) {
  // The Yellowstone SDK uses callback-style stream writes; wrap it so command
  // handlers can await backpressure/errors.
  if (!stream) throw new Error('Yellowstone stream is not connected')
  await new Promise((resolve, reject) => {
    stream.write(request, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function splitEnv(name) {
  // Comma-separated env filters keep .env setup simple.
  return String(process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function encodeBytes(value) {
  // Yellowstone protobuf fields can arrive in several byte representations.
  const bytes = toBuffer(value)
  return bytes.length ? bs58.encode(bytes) : ''
}

function byteLength(value) {
  return toBuffer(value).length
}

function toBuffer(value) {
  // Normalize common protobuf/Node byte shapes into Buffer before base58.
  if (!value) return Buffer.alloc(0)
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (Array.isArray(value)) return Buffer.from(value)
  if (value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data)
  if (typeof value === 'string') return Buffer.from(value, 'base64')
  return Buffer.alloc(0)
}

function emit(value) {
  // Stdout is the Rust IPC channel: exactly one JSON object per line.
  process.stdout.write(`${JSON.stringify(value)}\n`)
}
