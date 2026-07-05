# runtime/sidecars

Sidecars provide backend protocol adapters for things that are awkward or unavailable directly in Rust or a webview during the hackathon build.

## Files

- `coralos-bridge.mjs`: newline-delimited JSON bridge for CoralOS settlement/proxy calls.
- `yellowstone-bridge.mjs`: Yellowstone gRPC subscriber using Triton's Node SDK.

## Runtime Contract

- Rust spawns these scripts as child processes.
- Rust writes one JSON command per line to stdin.
- The sidecar writes one JSON response or event per line to stdout.
- Stderr is reserved for diagnostics.

## Rules

- Never send secrets back to the webview.
- Keep stdout machine-readable; use stderr for logs.
- Keep sidecar messages versionable and explicit because they are IPC boundaries.
