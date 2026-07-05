# tooling

Developer and build helper scripts live here.

## Files

- `prepare-sidecars.mjs`: copies the local Windows Node runtime into `runtime/sidecars/bin/node.exe` for Tauri bundling.

## Rules

- Keep one-off build helpers here instead of mixing them into app runtime directories.
- Tooling may create ignored/generated files, but should not mutate source code unexpectedly.
