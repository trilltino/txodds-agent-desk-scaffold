import { useState } from 'react'
import type { WalletContext } from '../../../types'
import { connectPhantom, disconnectPhantom, phantomAvailable } from '../../../core/wallet/phantom'

export function PhantomConnectButton() {
  const [wallet, setWallet] = useState<WalletContext>({
    provider: phantomAvailable() ? 'phantom' : 'unknown',
    connected: false,
    cluster: 'devnet'
  })
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    try {
      setWallet(wallet.connected ? await disconnectPhantom(wallet.cluster) : await connectPhantom(wallet.cluster))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="card walletPanel">
      <div className="cardHead">
        <h2>Phantom</h2>
        <span className="pill">{wallet.connected ? 'connected' : phantomAvailable() ? 'available' : 'desktop QR'}</span>
      </div>
      <p className="muted">
        {wallet.connected
          ? wallet.publicKey
          : phantomAvailable()
            ? 'Browser wallet detected for direct payment flows.'
            : 'Tauri desktop uses Solana Pay QR/deep links; Phantom injection is usually unavailable.'}
      </p>
      <button className="secondary" disabled={busy || !phantomAvailable()} onClick={toggle}>
        {wallet.connected ? 'Disconnect Phantom' : 'Connect Phantom'}
      </button>
    </article>
  )
}
