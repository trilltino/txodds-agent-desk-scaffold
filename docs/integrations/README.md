# docs/integrations

Integration docs explain how the app talks to external systems that are not owned by this repository.

## Files

- `coralos-settlement.md`: CoralOS settlement bridge behavior and expected local/proxy configuration.
- `triton-one.md`: Triton RPC and Yellowstone observation setup notes.

## Rules

- Document expected environment variables, transport shape, and failure modes.
- Do not paste bearer tokens, x-tokens, JWTs, payer keypairs, or endpoint secrets.
- Prefer explicit local-only assumptions for sidecars and loopback services.
