const rows = [
  ['Prediction Markets & Settlement', 'TxLINE stream triggers markets; proof receipt/verifier gates escrow release; Triton confirms on-chain state.'],
  ['Trading Tools & Agents', 'Sharp/risk/pundit agents run autonomously from live odds and log signals with deterministic scoring.'],
  ['Consumer & Fan Experiences', 'Fan card and AI pundit explain goals, red cards, and odds shifts in a mainstream UI.']
]

export function TrackScorecard() {
  return (
    <article className="card">
      <div className="cardHead">
        <h2>Three-track scorecard</h2>
        <span className="pill">submission story</span>
      </div>
      {rows.map(([title, body]) => (
        <div className="scoreRow" key={title}>
          <strong>{title}</strong>
          <p>{body}</p>
        </div>
      ))}
    </article>
  )
}
