# src

React frontend source for the Tauri webview lives here.

## Directories

- `components/`: screen and panel components rendered in the desktop window.
- `desktop/`: the Tauri IPC transport boundary.
- `domain/`: browser-dev fallback logic and shared UI-domain helpers.

## Rules

- Production desktop behavior should call Rust through `desktop/transport.ts`.
- Browser-only direct network paths are allowed only as development fallbacks.
- Secrets must never be imported, rendered, or bundled into frontend code.
