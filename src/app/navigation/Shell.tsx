import type { ReactNode } from 'react'
import type { UserAppPage } from '../../types'
import { ChainStatusStrip } from './ChainStatus'

interface Props {
  page: UserAppPage
  setPage: (page: UserAppPage) => void
  onStart: () => void
  children: ReactNode
}

export function Shell({ page, setPage, onStart, children }: Props) {
  const pages: Array<[UserAppPage, string, string]> = [
    ['pulse', 'Pulse Rooms', 'Consumer'],
    ['markets', 'Verified Markets', 'Web3'],
    ['agent', 'Intelligence Agent', 'Agent']
  ]
  const actionLabel = page === 'pulse'
    ? 'Create pulse card'
    : page === 'markets'
      ? 'Open verified run'
      : 'Run signal check'

  function navigate(nextPage: UserAppPage) {
    setPage(nextPage)
    window.location.hash = nextPage
  }

  return (
    <main className="appFrame">
      <header className="topBar">
        <div className="brandBlock">
          <div className="brandLockup">
            <span className="worldCupMark" aria-hidden="true"><span /></span>
            <div>
              <p className="eyebrow">TxLINE / Solana / Triton</p>
              <h1>World Cup Agent Desk</h1>
            </div>
          </div>
        </div>
        <nav className="appNav" aria-label="Product pages">
          {pages.map(([value, label, eyebrow]) => (
            <button key={value} className={page === value ? 'active' : ''} onClick={() => navigate(value)}>
              <span>{eyebrow}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="topActions">
          <ChainStatusStrip />
          <button onClick={onStart}>{actionLabel}</button>
        </div>
      </header>
      {children}
    </main>
  )
}
