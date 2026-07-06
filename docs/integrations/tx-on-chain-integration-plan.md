# txodds/tx-on-chain integration plan

**Status:** proposed implementation plan  
**Reviewed:** 2026-07-06  
**Upstream:** <https://github.com/txodds/tx-on-chain>  
**Local goal:** turn the current TxLINE + Yellowstone integration from "live data with raw proof placeholders" into typed TxLINE events, observed txoracle root publications, and proof receipts that can drive Pulse Rooms, Verified Markets, and the Match Intelligence Agent.

## 1. Executive summary

`txodds/tx-on-chain` is useful for this codebase. It is not a random infra fork; it is the official public integration source for the TxLINE hybrid off-chain API and Solana `txoracle` program.

The highest-leverage integration is a three-part spine:

1. Vendor the current `txoracle` IDLs and generate local constants/types from them.
2. Replace the live SSE parser's guesswork with typed TxLINE payload normalization using the official OpenAPI paths and score schemas.
3. Connect proof roots to data events: observe `insert_*_root` txoracle publications through Yellowstone, fetch `/api/*/validation` proof payloads from TxLINE, and populate `TxLineEvent.proof` / `VerificationReceipt`.

The current app already has the correct shape for this: Rust owns secrets, native TxLINE ingestion is centralized, `api.rs` has a documented allowlist, Yellowstone is supervised by Rust, and frontend event contracts already include proof fields. The missing piece is typed protocol knowledge.

## 2. Sources to pin

Use only current upstream artifacts for new work, and treat `backup/` as historical reference unless a current doc explicitly points there.

| Artifact | Upstream path | Local use |
| --- | --- | --- |
| Repo overview | `README.md` | Confirms TxLINE API origins, program IDs, data/proof model, and current content map. |
| Agent-readable docs index | `llms.txt` | Fast source map for docs and future agent runs. |
| Mainnet IDL/type | `idl/txoracle.json`, `types/txoracle.ts` | Mainnet program address, instruction discriminators, validation structs. |
| Devnet IDL/type | `examples/devnet/idl/txoracle.json`, `examples/devnet/types/txoracle.ts` | Devnet program address plus extra devnet trading examples/instructions. |
| Program address docs | `documentation/programs/addresses.mdx` | Network consistency, mint IDs, PDA derivation seeds. |
| OpenAPI spec | `https://txline.txodds.com/docs/docs.yaml` | Generate/validate local endpoint allowlists and request helpers. |
| Streaming docs | `documentation/examples/streaming-data.mdx` | SSE route names, headers, historical score caveat, compression notes. |
| Snapshot docs | `documentation/examples/fetching-snapshots.mdx` | Fixture, odds, and scores snapshot/update field examples. |
| Validation docs | `documentation/examples/onchain-validation.mdx` | `/api/scores/stat-validation`, proof-node mapping, PDA derivation, `validateStat` flow. |
| Devnet examples | `examples/devnet/scripts/*.ts` | `validateStatV2`, JWT renewal on stream reconnect, `Last-Event-ID`, proof payload shape. |
| Scores schemas | `assets/scores/schemas/**` | Canonical PascalCase score event fields, `Action`, `FixtureId`, `Seq`, `Ts`, `Score`, `Confirmed`. |
| Soccer docs | `documentation/scores/soccer-feed.mdx`, `assets/SoccerSupportedLeagues.csv` | Soccer phase/stat-key encoding and league coverage. |
| Odds coverage | `documentation/odds/odds-coverage.mdx` | StablePrice coverage by sport/competition. |

Pin all copied artifacts with:

- upstream URL
- upstream commit SHA
- fetched-at timestamp
- SHA-256 of the local copy
- upstream license note

Do not paste credentials, wallet keypairs, API tokens, or private endpoint URLs into any source manifest.

## 3. Current local baseline

Relevant files today:

| Local file | Current behavior | Gap unlocked by upstream |
| --- | --- | --- |
| `src-tauri/src/config.rs` | Derives txoracle program ID from `TXLINE_NETWORK`, matching upstream devnet/mainnet IDs. | Add stronger network/API-origin consistency checks and mint constants from generated metadata. |
| `src-tauri/src/services/txline/ingest.rs` | Connects to `/api/odds/stream` and `/api/scores/stream`; parses JSON with fallback key guesses; emits `proof: None`. | Normalize PascalCase payloads using schemas; extract `FixtureId`, `Seq`, `Ts`, `Action`, `Score`, and stat candidates deterministically. |
| `src-tauri/src/services/txline/api.rs` | Rust-owned authenticated GET with allowlisted data paths. Already allows validation endpoints. | Generate/verify allowlist from OpenAPI and add typed helpers for validation requests. |
| `src-tauri/src/services/chain/yellowstone.rs` | Supervises sidecar and forwards account/tx JSON. | Decode txoracle instruction data and emit structured root events. |
| `runtime/sidecars/yellowstone-bridge.mjs` | Emits account pubkey/owner/slot/dataLen and transaction signature/slot/error only. | Include bounded account data or transaction instruction details so Rust can decode root publications. |
| `src-tauri/src/types.rs` and `src/types.ts` | Already define `TxLineProofReceipt`, `VerificationReceipt`, and proof-related verdict checks. | Populate proof receipts with real Merkle root/proof/validation state. |
| `tooling/txline-onboard.mjs` | Creates guest JWT, sends free-tier subscribe, activates API token, writes `.env`, smoke-tests fixtures. | Diff against official free-tier examples; add token renewal, pricing matrix sanity, stream/proof smoke tests. |

The existing architecture note treats 2026-07-19 as the local free World Cup replay-capture deadline. Upstream docs describe subscriptions in 4-week multiples and free service levels; they do not currently publish that exact date as a global API cutoff. Keep the July 19 date in runbooks as our credential/demo deadline, and verify actual token/subscription expiry from the wallet/API token state.

## 4. What is useful immediately

### 4.1 Current IDL and TS types

Use the current mainnet IDL for stable production validation and the devnet IDL for devnet-only trading/proof experiments.

Important current mainnet instructions:

| Instruction | Why it matters |
| --- | --- |
| `subscribe(service_level_id, weeks)` | Aligns onboarding script with official account order and discriminator. |
| `insert_batch_root(epoch_day, hour, minute, root, account_bump)` | Odds root publication signal. |
| `insert_fixtures_root(epoch_day, index, root)` | Fixture root publication signal. |
| `insert_scores_root(epoch_day, hour, minute, root)` | Scores root publication signal. |
| `validate_fixture(...)` | Future fixture snapshot proof gate. |
| `validate_fixture_batch(...)` | Future fixture batch proof gate. |
| `validate_odds(...)` | Future odds proof gate. |
| `validate_stat(...)` | Initial score-stat proof simulation path. |
| `validate_stat_v2(payload, strategy)` | Better long-term score-stat strategy path; current devnet examples exercise it. |

Decision: do not depend on Anchor at runtime in the React webview. Either decode in Rust or in a Rust-supervised sidecar. The webview should only receive structured, already-sanitized proof/root events.

### 4.2 Scores schemas

The schemas remove the current field-name guessing in `ingest.rs`.

Canonical score update fields include:

| Field | Meaning |
| --- | --- |
| `FixtureId` | Fixture identifier; replaces guessing `fixtureId`, `fixture_id`, `gameId`, etc. |
| `Seq` | Ordered score update sequence; needed for `/api/scores/stat-validation`. |
| `Ts` | Event timestamp; maps to epoch day/hour/5-minute interval and validation PDA. |
| `Action` | Event type such as `touchdown`, `3pt_attempt`, `status`, `score_adjustment`. |
| `Type` | Message family/type in many score messages. |
| `Confirmed` | Distinguishes early/unconfirmed from confirmed score actions. |
| `Score` | Current score object using `Participant1` / `Participant2`, not home/away directly. |
| `ActionScoreDelta` | Score delta caused by the action when present. |
| `Participant` | Participant number affected by the action; home/away comes from fixture metadata. |

Normalization rule: keep raw payloads, but compute app behavior from canonical fields. For soccer/World Cup, add soccer-specific action/stat mappings from `documentation/scores/soccer-feed.mdx` rather than reusing US football/basketball assumptions.

### 4.3 OpenAPI spec

Current documented paths that already match or should shape local APIs:

```text
POST /auth/guest/start
POST /api/token/activate
POST /api/guest/purchase/quote
GET  /api/fixtures/snapshot
GET  /api/fixtures/updates/{epochDay}/{hourOfDay}
GET  /api/fixtures/validation
GET  /api/fixtures/batch-validation
GET  /api/odds/snapshot/{fixtureId}
GET  /api/odds/updates/{fixtureId}
GET  /api/odds/updates/{epochDay}/{hourOfDay}/{interval}
GET  /api/odds/stream
GET  /api/odds/validation
GET  /api/scores/snapshot/{fixtureId}
GET  /api/scores/updates/{epochDay}/{hourOfDay}/{interval}
GET  /api/scores/updates/{fixtureId}
GET  /api/scores/historical/{fixtureId}
GET  /api/scores/stream
GET  /api/scores/stat-validation
```

Local `api.rs` already allows the data/validation routes and leaves streaming to `ingest.rs`. Keep that split.

### 4.4 On-chain validation examples

The official validation path maps directly onto this app's proof model:

```text
TxLINE SSE/snapshot event
  -> extract FixtureId + Seq + statKey(s)
  -> GET /api/scores/stat-validation
  -> derive daily_scores_roots PDA from event timestamp epoch day
  -> simulate/view validateStat or validateStatV2
  -> emit VerificationReceipt
  -> attach TxLineProofReceipt to TxLineEvent / market run
```

Use `validateStatV2` for new multi-stat strategies once the client code can build the typed payload. Keep `validateStat` as the first narrow implementation because it is simpler and documented in the current validation page.

### 4.5 Subscription/free-tier examples

Upstream examples add things the local onboarding/live loop should adopt:

- Refresh guest JWT after 401/403. The OpenAPI description says guest JWTs expire after 30 days.
- Preserve and send `Last-Event-ID` across SSE reconnects. Local code already does this.
- Consider compression support for streams. With `reqwest` `default-features = false`, add explicit compression features before advertising gzip/deflate support.
- Check enabled service levels from the pricing matrix before trying real-time/free-tier variants.
- Keep selected leagues in the activation message exactly as `${txSig}:${selectedLeagues.join(",")}:${jwt}`; for the standard free bundle this is `${txSig}::${jwt}`.

## 5. Architecture target

```text
Upstream pinned artifacts
  -> generated constants/types/schemas
  -> Rust TxLINE ingestion normalizer
  -> normalized txline://event
  -> proof scheduler
  -> TxLINE validation API
  -> txoracle PDA/instruction decoder
  -> simulate/view validation
  -> proof receipt
  -> UI, market resolver, intelligence agent
```

No component should call TxLINE, Solana RPC, Anchor, Yellowstone, or a proof endpoint directly from React. Components listen to typed events and call Tauri commands.

## 6. Proposed local files

Add these files over several PRs:

```text
docs/integrations/tx-on-chain-integration-plan.md
docs/integrations/tx-on-chain-sources.lock.json

tooling/sync-tx-on-chain.mjs
tooling/generate-txline-openapi.mjs
tooling/generate-score-schema-index.mjs

vendor/tx-on-chain/
  README.md
  LICENSE
  manifest.json
  idl/txoracle.mainnet.json
  idl/txoracle.devnet.json
  types/txoracle.mainnet.ts
  types/txoracle.devnet.ts
  schemas/scores/{basketball,usfootball}/...
  docs/{addresses,onchain-validation,streaming-data,fetching-snapshots,soccer-feed,odds-coverage}.mdx

src-tauri/src/services/txline/
  contracts.rs
  normalize.rs
  proof.rs
  validation.rs

src-tauri/src/services/chain/
  txoracle.rs
  txoracle_idl.rs

src/core/txline/
  normalized.ts
  schemaIndex.ts
  statKeys.ts

src/core/proof/
  receipts.ts
```

Alternative to `vendor/`: place generated artifacts under `src-tauri/resources/txline/` and `src/core/txline/generated/`. The important rule is to copy only selected integration artifacts, not the whole upstream repo.

## 7. Phase plan

### Phase 0 - Pin upstream artifacts

Deliverables:

- `tooling/sync-tx-on-chain.mjs` fetches selected raw GitHub URLs by commit SHA.
- `docs/integrations/tx-on-chain-sources.lock.json` records source URL, SHA-256, and commit.
- Vendored IDLs/types/schemas/docs land in a small, explicit folder.
- CI/check script fails when generated files are stale.

Implementation notes:

- Fetch both mainnet and devnet IDLs because upstream keeps devnet examples under `examples/devnet`.
- Keep `backup/` out of the vendor set unless a specific historical example is needed for a test fixture.
- Record upstream version `1.5.5` from IDL metadata, but rely on commit SHA for reproducibility.

Acceptance:

- `node tooling/sync-tx-on-chain.mjs --check` confirms local artifacts match the lockfile.
- The app can print current TxLINE network constants without opening the webview.

### Phase 1 - Generate local contracts from OpenAPI and IDL

Deliverables:

- Generated endpoint table for `api.rs` tests.
- Generated txoracle instruction discriminator constants.
- Generated PDA helper documentation/tests for:
  - `pricing_matrix`
  - `token_treasury_v2`
  - `daily_scores_roots`
  - `daily_batch_roots`
  - `ten_daily_fixtures_roots`
- Network consistency guard:
  - devnet program ID must use `https://txline-dev.txodds.com`
  - mainnet program ID must use `https://txline.txodds.com`

Implementation notes:

- Keep generated Rust simple: constants and lightweight structs first.
- Do not introduce full Anchor Rust dependencies unless needed for simulation. For decoding instruction payloads, the IDL plus Borsh/byte parsing is enough.
- Use `bs58`, `hex`, and existing `serde_json`; add `borsh` only if the decoder actually uses Borsh structs.

Acceptance:

- Unit tests verify the local program IDs and API origins match upstream.
- Unit tests verify known discriminators:
  - `subscribe`: `254,28,191,138,156,179,183,53`
  - `insert_scores_root`: `137,39,242,97,131,204,100,133`
  - `insert_batch_root`: `243,170,208,158,207,29,237,93`
  - `insert_fixtures_root`: `18,70,8,160,75,200,109,235`

### Phase 2 - Replace SSE guesswork with schema-aware normalization

Deliverables:

- `normalize.rs` maps raw TxLINE payloads into a widened event model.
- `TxLineEvent` gains optional fields needed by proof and cross-sport UI:
  - `seq`
  - `txline_ts`
  - `action`
  - `confirmed`
  - `participant`
  - `period`
  - `stat_keys`
  - `schema_family`
- Frontend `src/types.ts` mirrors the widened fields.
- Existing mock/replay files continue to deserialize with defaults.

Implementation notes:

- For scores, read canonical PascalCase first and keep old fallback keys only for replay/backward compatibility.
- For score totals, map `Participant1`/`Participant2` through fixture metadata instead of assuming home/away.
- Do not throw away unknown score events. Emit them as `score_update` with raw preserved and `schemaFamily` set when detected.
- Add fixture cache keyed by `FixtureId` so event normalization can resolve names, home/away, competition, and sport.

Acceptance:

- Given a basketball `3pt_attempt` payload, parser extracts `FixtureId`, `Seq`, `Ts`, `Action`, `Confirmed`, and score if present.
- Given a US football `touchdown` payload, parser emits `goal`-like product signal only through a sport-specific mapper, not by string accident.
- Given an old replay event, parser preserves behavior.

### Phase 3 - Improve Yellowstone txoracle observation

Current issue: the sidecar emits too little data. Account updates include `dataLen` but not bytes; transaction updates include signature/slot/error but not instructions.

Deliverables:

- Sidecar emits bounded transaction instruction details for txs involving `txoracle`.
- Rust decodes `insert_scores_root`, `insert_batch_root`, and `insert_fixtures_root` instruction payloads.
- New event payload:

```rust
pub struct TxOracleRootEvent {
    pub channel: TxOracleChannel,      // scores | odds | fixtures
    pub program_id: String,
    pub root_pda: Option<String>,
    pub root_hex: String,
    pub epoch_day: u16,
    pub hour_of_day: Option<u8>,
    pub minute_of_hour: Option<u8>,
    pub fixture_index: Option<u64>,
    pub slot: u64,
    pub signature: Option<String>,
    pub observed_at: String,
}
```

Implementation notes:

- Prefer transaction-instruction decoding first. It avoids guessing private account layouts for root storage accounts.
- Add account data bytes later only for specific watched PDAs and with maximum-size guards.
- Derive current and near-future PDAs for scores/odds/fixtures and optionally add `watchAccount` filters, but do not depend on account-data decoding for the first proof-ready signal.
- Treat all on-chain data as untrusted:
  - check owner/program ID
  - check instruction discriminator
  - check byte lengths before decoding
  - never execute or prompt from on-chain strings

Acceptance:

- A txoracle `insert_scores_root` tx emits a structured root event with root hex and interval.
- Root events are persisted or replay-capturable alongside TxLINE events.
- UI can show "scores root observed" with slot/signature before proof validation exists.

### Phase 4 - Fetch validation proof payloads

Deliverables:

- `services/txline/proof.rs` typed client methods:
  - `fetch_scores_stat_validation(fixture_id, seq, stat_keys)`
  - `fetch_odds_validation(...)`
  - `fetch_fixture_validation(...)`
- `TxLineProofReceipt` expands or maps to:
  - `fixture_id`
  - `seq`
  - `stat_keys`
  - `txline_ts`
  - `epoch_day`
  - `root_pda`
  - `merkle_root`
  - `sub_tree_proof_present`
  - `main_tree_proof_present`
  - `stat_proof_present`
  - `root_observed_slot`
  - `txline_program`
  - `verified`
  - `note`
- Proof scheduler listens for events with `FixtureId + Seq` and either:
  - fetches proof immediately if the matching root interval has already been observed, or
  - queues the event until the relevant root event arrives.

Implementation notes:

- Scores/odds roots are published for 5-minute UTC-aligned intervals. Compute interval from `Ts`.
- Fixture roots use daily/10-day PDA logic from upstream address docs.
- Do not block live event rendering on proof fetch. Emit an update event or a `proof_received` event when proof arrives.
- Store the raw validation payload in `VerificationReceipt.raw`, not in the top-level event body.

Acceptance:

- A score event with `Seq` can produce a receipt with Merkle proof presence flags.
- Missing/expired API credentials produce `credentials_required`, not a panic.
- Replay mode can replay proof receipt updates deterministically.

### Phase 5 - Simulate on-chain validation

Two viable implementation paths:

| Path | Pros | Cons | Recommendation |
| --- | --- | --- | --- |
| Rust-native Borsh/instruction builder | Keeps proof gate in Rust, no extra runtime boundary, aligns with secret boundary. | More upfront work to mirror Anchor IDL structs and view/simulate semantics. | Long-term target. |
| Rust-supervised Node/Anchor sidecar | Fastest path using official TS types and examples; Tauri already supervises Node sidecars. | Another sidecar and dependency surface; must keep secrets out and sanitize payloads. | Good first implementation for `validateStatV2`. |

Recommended sequence:

1. Start with Rust proof retrieval and receipt shaping.
2. Add a local-only validation sidecar for Anchor `program.methods.validateStat(...).view()` and `validateStatV2(...).view()`.
3. Once receipts and UI are stable, port the narrow validation builder to Rust if runtime packaging demands it.

Simulation guardrails:

- Never sign or send settlement/validation transactions without explicit user approval.
- Use read-only simulation/view for validation by default.
- Display cluster, program ID, root PDA, fixture ID, seq, stat keys, and predicate in the receipt.
- Mainnet validation is read-only unless the user explicitly enables mainnet and confirms the cluster.

Acceptance:

- `VerificationReceipt.onchainValidationStatus` can be `simulated_pass` or `simulated_fail`.
- Market settlement stays blocked unless deterministic predicate and proof checks pass.
- UI distinguishes "proof fetched" from "on-chain simulation passed".

### Phase 6 - Upgrade onboarding and credential operations

Deliverables:

- `tooling/txline-onboard.mjs` is diffed against upstream `subscription_free_tier.ts` and current World Cup docs.
- Add `--smoke stream`, `--smoke proof`, and `--smoke all`.
- Add JWT renewal helper to native live stream loop.
- Persist non-secret credential metadata:
  - network
  - wallet pubkey
  - service level
  - weeks
  - selected leagues
  - tx signature
  - activation timestamp
  - expected renewal date

Implementation notes:

- Local script currently hardcodes the subscribe discriminator. That is acceptable if generated and tested against the pinned IDL.
- Add service-level matrix check before trying level `12`; upstream docs say mainnet offers level `1` and `12`, while devnet currently documents level `1`.
- Keep `.env` writes limited to `TXLINE_NETWORK`, `TXLINE_API_ORIGIN`, `TXLINE_GUEST_JWT`, and `TXLINE_API_TOKEN`.
- Do not store keypair paths or private keys in generated metadata.

Acceptance:

- `npm run txline:onboard -- --network devnet --level 1 --smoke all` verifies fixtures, SSE, and one validation-capable score route when data is available.
- 401/403 during live streaming triggers guest JWT renewal and reconnect.

### Phase 7 - Use soccer coverage and stat keys

Deliverables:

- Add `src/core/txline/statKeys.ts` and Rust mirror for soccer stat keys.
- Add coverage import for `SoccerSupportedLeagues.csv`.
- Fixture board can show sport/competition coverage status.
- Market templates can generate soccer predicates:
  - participant 1 goals
  - participant 2 goals
  - yellow cards
  - red cards
  - corners
  - period-specific keys via `(period * 1000) + base_key`

Implementation notes:

- World Cup/International Friendlies are soccer-centered, so soccer should be first-class even though score schemas currently include large basketball and US football schema sets.
- StablePrice odds coverage includes soccer via CSV plus NCAAB/NCAAF competition IDs. Keep odds coverage separate from scores coverage.

Acceptance:

- A soccer fixture can produce a valid market rule using documented stat-key encoding.
- The app does not label soccer goals/cards through basketball or US football schema paths.

### Phase 8 - UI and product surfaces

Deliverables:

- `ProofDrawer` shows:
  - TxLINE event identity
  - root observed status
  - proof fetched status
  - deterministic predicate status
  - simulation status
  - txoracle program and PDA
  - slot/signature/explorer link when present
- `RawTxLineFeed` can toggle raw/normalized/proof views.
- `FixtureBoard` shows coverage and subscription state.
- `Verified Markets` uses `VerificationReceipt` as the only settlement gate.
- `Intelligence Agent` treats `proof_received` as a signal source.

Acceptance:

- Operator can answer: "Which API event, which Merkle root, which proof, which on-chain validation, which settlement?"
- No React component needs token access to answer that.

## 8. Testing plan

Unit tests:

- `normalize.rs`:
  - basketball `3pt_attempt`
  - US football `touchdown`
  - soccer stat-key mapping
  - legacy replay compatibility
- `api.rs`:
  - all documented allowed data paths
  - rejected external/path-traversal routes
  - validation routes
- `txoracle.rs`:
  - instruction discriminator matching
  - root instruction decode byte lengths
  - PDA derivation for known epoch days
- `proof.rs`:
  - proof-node conversion from base64/hex/array into `[u8; 32]`
  - missing fields fail closed

Integration tests:

- local replay with event -> proof queued -> root observed -> proof fetched
- stream reconnect with `Last-Event-ID`
- JWT renewal on mocked 401/403
- sidecar emits txoracle instruction details and Rust emits root event

Manual smoke tests:

```bash
npm run lint:types
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run txline:onboard -- --network devnet --level 1 --smoke fixtures
```

Add live API smoke tests behind explicit env flags so CI never burns credentials accidentally.

## 9. Security and correctness rules

- Keep TxLINE JWT/API token in Rust/keyring only.
- Keep Triton `x-token` in Rust/sidecar env only.
- Never pass keypairs, seed phrases, or wallet private keys into the webview.
- Treat TxLINE payloads and on-chain data as untrusted.
- Validate account owner/program ID before decoding.
- Validate discriminator and data length before deserializing.
- Do not let LLM output influence proof pass/fail, predicate pass/fail, settlement, or wallet operations.
- Use one network consistently: Solana RPC, txoracle program ID, TxLINE API origin, TxL mint, and activation endpoint must all match.
- Default to devnet for write/sign flows.
- Mainnet read-only proof simulation requires an explicit user-enabled mainnet setting; mainnet writes require separate explicit confirmation.

## 10. Risks and open questions

| Risk | Mitigation |
| --- | --- |
| Mainnet and devnet IDLs differ. | Pin both; choose by `TXLINE_NETWORK`; generate tests for current local defaults. |
| Root-storage account layout is not exposed as a top-level IDL account. | Decode root publication instructions first; add account decoding only after observed bytes and owner/discriminator checks are understood. |
| Score schemas are large. | Vendor selected schema families, build a compact schema index, do not load every schema into runtime memory unless needed. |
| `reqwest` compression support is disabled by `default-features = false`. | Add explicit compression features before setting `Accept-Encoding` in native ingestion. |
| API token/JWT expiry interrupts long demos. | Add JWT renewal and visible credential expiry metadata; capture replays before the local 2026-07-19 deadline. |
| Proof fetch availability depends on root publication timing. | Queue proof work by 5-minute interval and emit "pending root" state instead of blocking. |
| `validateStatV2` strategy building is easy to get subtly wrong. | Start with official examples as golden fixtures and record predicate/strategy verbatim in receipts. |
| Whole-repo vendoring could bloat the app. | Vendor only IDLs, types, docs, and schema subsets with checksums. |

## 11. Recommended first PR

The first implementation PR should be deliberately small:

1. Add `tooling/sync-tx-on-chain.mjs`.
2. Vendor mainnet/devnet IDLs and a source lockfile.
3. Generate Rust constants for txoracle program IDs, discriminators, and PDA seeds.
4. Add tests that compare `config.rs` defaults to generated constants.
5. Update `yellowstone-bridge.mjs` to emit transaction instruction metadata for txoracle transactions.
6. Add a Rust decoder for only `insert_scores_root`, `insert_batch_root`, and `insert_fixtures_root`.
7. Emit/log structured `TxOracleRootEvent`; do not fetch proofs yet.

This turns "we watch txoracle" into "we can see and understand proof-root publications" without changing product behavior or settlement gates.

## 12. Definition of done

This integration is complete when:

- Live scores/odds events are normalized from canonical upstream field names, not guesses.
- The app observes txoracle root publications as structured root events.
- A score event with `FixtureId`, `Seq`, and stat key can fetch a TxLINE validation payload.
- A receipt records proof fetched, root observed, deterministic predicate result, and simulation result separately.
- Verified Markets can settle only from a passing receipt.
- Replay mode can demonstrate the full event -> root -> proof -> validation -> settlement story without live credentials.
- All copied upstream artifacts are pinned, checksummed, and source-linked.
