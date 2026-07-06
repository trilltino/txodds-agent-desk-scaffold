# seller-risk-policy

The risk policy seller converts market signals into bounded risk guidance.

## Manifest

- `coral-agent.toml`: seller identity, risk-policy service name, and default policy posture.

## Runtime Status

Current risk behavior is represented by deterministic Rust scoring and delivery text. Future work should move spend caps, exposure windows, and allowed actions into manifest-driven strategy configuration.
