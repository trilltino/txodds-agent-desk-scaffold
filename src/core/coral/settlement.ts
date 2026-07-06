import type { AgentDelivery, SettlementReceipt, TxLineProofReceipt } from '../../types'

// Build the stable settlement reference from the strongest available proof.
// TxLINE proof data wins; otherwise the delivery hash is still deterministic.
export function buildReference(delivery: AgentDelivery, proof?: TxLineProofReceipt): string {
  return proof?.merkleRoot ? `txline:${proof.fixtureId}:${proof.merkleRoot}:${delivery.sha256}` : `sha256:${delivery.sha256}`
}

// Browser-only placeholder for UI shape. Real escrow creation belongs in Rust
// or the CoralOS sidecar so keypairs never enter JavaScript.
export async function createDevnetEscrowStub(delivery: AgentDelivery, proof?: TxLineProofReceipt): Promise<SettlementReceipt> {
  return {
    status: 'deposited',
    reference: buildReference(delivery, proof),
    escrowPda: 'replace-with-real-escrow-pda',
    depositTx: 'replace-with-real-deposit-signature',
    explorerUrl: 'https://explorer.solana.com/?cluster=devnet',
    tritonObserved: false
  }
}

// Browser-only placeholder for release display. Production release authority is
// intentionally outside the webview.
export async function releaseDevnetEscrowStub(receipt: SettlementReceipt): Promise<SettlementReceipt> {
  return {
    ...receipt,
    status: 'released',
    releaseTx: 'replace-with-real-release-signature',
    explorerUrl: 'https://explorer.solana.com/?cluster=devnet'
  }
}
