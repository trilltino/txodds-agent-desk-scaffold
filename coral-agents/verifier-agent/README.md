# verifier-agent

The verifier checks delivery shape, fixture binding, hashes, proofs, and policy gates before settlement.

## Manifest

- `coral-agent.toml`: verifier identity and default verification policy.

## Runtime Status

Verification currently runs as deterministic Rust checks. This is the right authority boundary: any future LLM assistance should explain or classify evidence, but final settlement gates should remain deterministic.
