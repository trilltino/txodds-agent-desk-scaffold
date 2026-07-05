# src/domain

Domain helpers model Coral, Triton, and TxLINE concepts for the frontend.

## Directories

- `coral/`: browser-dev Coral market simulation and agent list fallback.
- `triton/`: browser-dev Triton RPC fallback client.
- `txline/`: browser-dev TxLINE fallback client, event fixtures, and mock stream.

## Rules

- Keep these helpers deterministic and side-effect-light where possible.
- Production desktop mode should prefer Rust for ingestion, chain observation, settlement, and persistence.
- When adding new domain concepts, define shared types in `src/types.ts` before duplicating shapes.
