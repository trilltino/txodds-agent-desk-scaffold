import type { WalletContext } from '../../types'

type PhantomProvider = {
  isPhantom?: boolean
  publicKey?: { toString(): string }
  connect(): Promise<{ publicKey: { toString(): string } }>
  disconnect?(): Promise<void>
}

declare global {
  interface Window {
    solana?: PhantomProvider
  }
}

export function phantomAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.solana?.isPhantom)
}

export async function connectPhantom(cluster: WalletContext['cluster'] = 'devnet'): Promise<WalletContext> {
  const provider = window.solana
  if (!provider?.isPhantom) {
    return { provider: 'unknown', connected: false, cluster }
  }
  const result = await provider.connect()
  return {
    provider: 'phantom',
    publicKey: result.publicKey.toString(),
    connected: true,
    cluster
  }
}

export async function disconnectPhantom(cluster: WalletContext['cluster'] = 'devnet'): Promise<WalletContext> {
  await window.solana?.disconnect?.()
  return { provider: 'phantom', connected: false, cluster }
}
