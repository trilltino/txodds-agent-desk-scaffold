# Legacy Coral Agent Manifests

These manifests preserve the earlier CoralOS buyer/seller/verifier/arbiter role pattern for reference. They are not the active product path.

The lean track plan uses:

- Pulse Rooms for the consumer track
- Verified Markets for the Web3/platform track
- one Match Intelligence Agent for the agent track

The deterministic compatibility engine still mirrors these identities through `src-tauri/src/services/coral/agents.rs` and `src/core/coral/agents.ts` until the Match Intelligence runtime replaces `run_agent_round`.

## Archived Roles

| Manifest | Former role | Former service |
| --- | --- | --- |
| `worldcup-buyer-agent` | buyer | Converted TxLINE triggers into WANTs and awarded sellers. |
| `seller-worldcup-edge` | seller | Sold fixture-bound TxLINE fair-line reads. |
| `seller-risk-policy` | seller | Sold risk policy and no-action/observe/simulate guidance. |
| `seller-fan-card` | seller | Sold shareable fan-card output. |
| `verifier-agent` | verifier | Checked hash, fixture binding, proof shape, and policy gates. |
| `settlement-arbiter-agent` | settlement | Bridged verified runs to CoralOS settlement and Triton observation. |
