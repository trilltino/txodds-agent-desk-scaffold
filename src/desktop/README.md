# src/desktop

The desktop transport layer hides whether the app is running inside Tauri or in browser-only Vite dev mode.

## Files

- `transport.ts`: typed wrapper around Tauri `invoke`/`listen` plus browser fallback behavior.

## Rules

- This should be the only frontend code that imports `@tauri-apps/api`.
- Native mode should route privileged operations to Rust.
- Browser fallback mode exists for UI iteration, not production behavior.
