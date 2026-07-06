#!/usr/bin/env node
// TxLINE World Cup free-tier onboarding.
//
// Mints live TxLINE credentials end-to-end with no manual steps:
//   1. POST /auth/guest/start                 -> guest JWT
//   2. txoracle `subscribe(level, weeks)`     -> free on-chain subscription txSig
//   3. nacl sign `${txSig}:${leagues}:${jwt}` -> wallet activation signature
//   4. POST /api/token/activate               -> long-lived API token
//   5. Write TXLINE_* values into .env and smoke-test /api/fixtures/snapshot.
//
// Usage:
//   node tooling/txline-onboard.mjs                       # devnet, level 1 (60s delay)
//   node tooling/txline-onboard.mjs --network mainnet --level 12   # real-time feed
//   node tooling/txline-onboard.mjs --keypair path/to/id.json
//
// The World Cup tiers are free: the subscribe instruction moves 0 TxL, the
// wallet only pays network fees (airdropped automatically on devnet).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import nacl from 'tweetnacl'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction
} from '@solana/web3.js'
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction
} from '@solana/spl-token'

// Network constants from https://txline.txodds.com/documentation/worldcup.
const NETWORKS = {
  devnet: {
    rpc: 'https://api.devnet.solana.com',
    apiOrigin: 'https://txline-dev.txodds.com',
    programId: '6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J',
    txlMint: '4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG'
  },
  mainnet: {
    rpc: 'https://api.mainnet-beta.solana.com',
    apiOrigin: 'https://txline.txodds.com',
    programId: '9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA',
    txlMint: 'Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL'
  }
}

// `subscribe` instruction from the published txoracle IDL (v1.5.2):
// args (service_level_id: u16, weeks: u8).
const SUBSCRIBE_DISCRIMINATOR = Buffer.from([254, 28, 191, 138, 156, 179, 183, 53])

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..')
const ENV_PATH = path.join(REPO_ROOT, '.env')
const GENERATED_WALLET_PATH = path.join(REPO_ROOT, '.txline', 'wallet.json')

function parseArgs(argv) {
  const args = { network: 'devnet', level: undefined, weeks: 4, keypair: undefined, rpc: undefined, origin: undefined }
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i]
    const next = () => {
      i += 1
      if (i >= argv.length) throw new Error(`missing value for ${flag}`)
      return argv[i]
    }
    if (flag === '--network') args.network = next()
    else if (flag === '--level') args.level = Number(next())
    else if (flag === '--weeks') args.weeks = Number(next())
    else if (flag === '--keypair') args.keypair = next()
    else if (flag === '--rpc') args.rpc = next()
    else if (flag === '--origin') args.origin = next()
    else if (flag === '--help' || flag === '-h') {
      console.log('usage: node tooling/txline-onboard.mjs [--network devnet|mainnet] [--level 1|12] [--weeks N] [--keypair path] [--rpc url] [--origin url]')
      process.exit(0)
    } else throw new Error(`unknown flag ${flag}`)
  }
  if (!NETWORKS[args.network]) throw new Error(`--network must be devnet or mainnet, got ${args.network}`)
  // Level 1 = World Cup & Int Friendlies with 60s delay; level 12 = real-time (mainnet only).
  if (args.level === undefined) args.level = args.network === 'mainnet' ? 12 : 1
  if (args.level === 12 && args.network !== 'mainnet') {
    throw new Error('service level 12 (real-time) is mainnet only; use --network mainnet or --level 1')
  }
  if (!Number.isInteger(args.level) || args.level < 1) throw new Error(`invalid --level ${args.level}`)
  if (!Number.isInteger(args.weeks) || args.weeks < 4 || args.weeks % 4 !== 0) {
    throw new Error('--weeks must be a positive multiple of 4')
  }
  return args
}

function loadKeypair(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.TXLINE_WALLET,
    process.env.PAYER_KEYPAIR_PATH?.replace(/^~([\\/])/, `${os.homedir()}$1`),
    path.join(os.homedir(), '.config', 'solana', 'id.json'),
    GENERATED_WALLET_PATH
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    const secret = Uint8Array.from(JSON.parse(fs.readFileSync(candidate, 'utf8')))
    const keypair = Keypair.fromSecretKey(secret)
    console.log(`wallet   ${keypair.publicKey.toBase58()} (${candidate})`)
    return keypair
  }
  const keypair = Keypair.generate()
  fs.mkdirSync(path.dirname(GENERATED_WALLET_PATH), { recursive: true })
  fs.writeFileSync(GENERATED_WALLET_PATH, JSON.stringify(Array.from(keypair.secretKey)))
  console.log(`wallet   ${keypair.publicKey.toBase58()} (generated at ${GENERATED_WALLET_PATH})`)
  return keypair
}

async function ensureFees(connection, keypair, network) {
  const balance = await connection.getBalance(keypair.publicKey)
  console.log(`balance  ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`)
  if (balance >= 0.01 * LAMPORTS_PER_SOL) return
  if (network !== 'devnet') {
    throw new Error(`wallet ${keypair.publicKey.toBase58()} needs ~0.01 SOL on mainnet for fees/rent`)
  }
  console.log('airdrop  requesting 1 SOL from the devnet faucet...')
  const signature = await connection.requestAirdrop(keypair.publicKey, LAMPORTS_PER_SOL)
  const latest = await connection.getLatestBlockhash()
  await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
}

async function guestStart(origin) {
  const response = await fetch(`${origin}/auth/guest/start`, { method: 'POST' })
  if (!response.ok) throw new Error(`guest/start failed: HTTP ${response.status} ${await response.text()}`)
  const body = await response.json()
  const jwt = body.token ?? body.jwt ?? body.accessToken
  if (!jwt) throw new Error(`guest/start returned no token: ${JSON.stringify(body)}`)
  return jwt
}

async function subscribeOnChain(connection, keypair, net, level, weeks) {
  const programId = new PublicKey(net.programId)
  const mint = new PublicKey(net.txlMint)
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync([Buffer.from('pricing_matrix')], programId)
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync([Buffer.from('token_treasury_v2')], programId)
  const userTokenAccount = getAssociatedTokenAddressSync(mint, keypair.publicKey, false, TOKEN_2022_PROGRAM_ID)
  const tokenTreasuryVault = getAssociatedTokenAddressSync(mint, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID)

  const data = Buffer.alloc(11)
  SUBSCRIBE_DISCRIMINATOR.copy(data, 0)
  data.writeUInt16LE(level, 8)
  data.writeUInt8(weeks, 10)

  const subscribe = new TransactionInstruction({
    programId,
    data,
    // Account order matches the txoracle IDL `subscribe` definition.
    keys: [
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: pricingMatrixPda, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: tokenTreasuryVault, isSigner: false, isWritable: true },
      { pubkey: tokenTreasuryPda, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ]
  })

  // The free tier still routes through the user's TxL ATA; create it up front so
  // the subscribe instruction never fails on a missing account.
  const ensureAta = createAssociatedTokenAccountIdempotentInstruction(
    keypair.publicKey,
    userTokenAccount,
    keypair.publicKey,
    mint,
    TOKEN_2022_PROGRAM_ID
  )

  const tx = new Transaction().add(ensureAta, subscribe)
  return sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' })
}

async function activateToken(origin, jwt, txSig, keypair, leagues) {
  // Activation message format documented on the World Cup page.
  const message = new TextEncoder().encode(`${txSig}:${leagues.join(',')}:${jwt}`)
  const walletSignature = Buffer.from(nacl.sign.detached(message, keypair.secretKey)).toString('base64')
  const response = await fetch(`${origin}/api/token/activate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ txSig, walletSignature, leagues })
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`token/activate failed: HTTP ${response.status} ${text}`)
  // The endpoint returns the token either as JSON or as a bare string
  // (e.g. "txoracle_api_...").
  let apiToken
  try {
    const body = JSON.parse(text)
    apiToken = typeof body === 'string' ? body : (body.apiToken ?? body.token ?? body.api_token ?? body.apiKey)
  } catch {
    apiToken = /^\S+$/.test(text.trim()) ? text.trim() : undefined
  }
  if (!apiToken) throw new Error(`token/activate returned no API token: ${text}`)
  return apiToken
}

function writeEnv(values) {
  let contents = ''
  if (fs.existsSync(ENV_PATH)) contents = fs.readFileSync(ENV_PATH, 'utf8')
  else if (fs.existsSync(path.join(REPO_ROOT, '.env.example'))) contents = fs.readFileSync(path.join(REPO_ROOT, '.env.example'), 'utf8')
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`
    const pattern = new RegExp(`^${key}=.*$`, 'm')
    contents = pattern.test(contents) ? contents.replace(pattern, line) : `${contents.trimEnd()}\n${line}\n`
  }
  fs.writeFileSync(ENV_PATH, contents.endsWith('\n') ? contents : `${contents}\n`)
}

async function smokeTest(origin, jwt, apiToken) {
  const epochDay = Math.floor(Date.now() / 86_400_000)
  const response = await fetch(`${origin}/api/fixtures/snapshot?startEpochDay=${epochDay}`, {
    headers: { Authorization: `Bearer ${jwt}`, 'X-Api-Token': apiToken }
  })
  if (!response.ok) throw new Error(`fixtures/snapshot smoke test failed: HTTP ${response.status} ${await response.text()}`)
  const body = await response.json()
  const fixtures = Array.isArray(body) ? body : (body.fixtures ?? body.data ?? [])
  console.log(`smoke    /api/fixtures/snapshot ok - ${Array.isArray(fixtures) ? fixtures.length : '?'} fixtures from epoch day ${epochDay}`)
}

async function main() {
  const args = parseArgs(process.argv)
  const net = NETWORKS[args.network]
  const rpc = args.rpc ?? net.rpc
  const origin = (args.origin ?? net.apiOrigin).replace(/\/+$/, '')
  console.log(`network  ${args.network} (level ${args.level}, ${args.weeks} weeks)`)
  console.log(`rpc      ${rpc}`)
  console.log(`origin   ${origin}`)

  const keypair = loadKeypair(args.keypair)
  const connection = new Connection(rpc, 'confirmed')
  await ensureFees(connection, keypair, args.network)

  const jwt = await guestStart(origin)
  console.log(`jwt      ${jwt.slice(0, 24)}... (guest session started)`)

  const txSig = await subscribeOnChain(connection, keypair, net, args.level, args.weeks)
  console.log(`txSig    ${txSig}`)

  const leagues = []
  const apiToken = await activateToken(origin, jwt, txSig, keypair, leagues)
  console.log(`token    ${String(apiToken).slice(0, 12)}... (activated)`)

  writeEnv({
    TXLINE_NETWORK: args.network,
    TXLINE_API_ORIGIN: origin,
    TXLINE_GUEST_JWT: jwt,
    TXLINE_API_TOKEN: apiToken
  })
  console.log(`env      TXLINE_* written to ${ENV_PATH}`)

  await smokeTest(origin, jwt, apiToken)
  console.log('done     restart the desktop app (just desktop) to pick up live credentials')
}

main().catch((err) => {
  console.error(`onboarding failed: ${err.message ?? err}`)
  process.exit(1)
})
