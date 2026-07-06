import type { AgentRun } from '../../../types'

export function SolanaPayCheckout({ run }: { run?: AgentRun }) {
  const settlement = run?.settlement
  const paymentUrl = settlement?.paymentUrl

  async function copyUrl() {
    if (!paymentUrl) return
    await navigator.clipboard?.writeText(paymentUrl)
  }

  return (
    <article className="card walletPanel">
      <div className="cardHead">
        <h2>Solana Pay</h2>
        <span className="pill">{settlement?.paymentStatus ?? 'not_created'}</span>
      </div>
      <div className="receipt">
        <span>Reference</span><code>{settlement?.paymentReference ?? settlement?.reference ?? '-'}</code>
        <span>Amount</span><strong>{settlement?.paymentAmountSol ? `${settlement.paymentAmountSol} SOL` : '-'}</strong>
        <span>Memo</span><code>{settlement?.paymentMemo ?? '-'}</code>
      </div>
      <div className="buttonRow">
        <button className="secondary" disabled={!paymentUrl} onClick={copyUrl}>Copy URL</button>
        <a className={paymentUrl ? 'linkButton' : 'linkButton disabled'} href={paymentUrl} aria-disabled={!paymentUrl}>Open Phantom</a>
      </div>
    </article>
  )
}
