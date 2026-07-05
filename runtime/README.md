# runtime

Runtime assets that execute outside the React webview live here.

## Directories

- `sidecars/`: Node sidecar entrypoints for CoralOS settlement and Yellowstone gRPC streaming.

## Rules

- The webview never runs these files directly.
- Secrets and privileged network calls stay in Rust or sidecar processes, not in React.
- Generated runtime files such as `runtime/sidecars/bin/node.exe` are ignored and recreated by `just prepare-sidecars` or `npm run prepare:sidecars`.
