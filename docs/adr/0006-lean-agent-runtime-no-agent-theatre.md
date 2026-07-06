# ADR 0006 - Lean agent runtime, no agent theatre

**Status:** accepted (2026-07-06)

## Decision

The active runtime has one autonomous **Match Intelligence Agent**. The
buyer/seller/verifier/arbiter role agents are removed from the product path:
their manifests are archived under `docs/legacy-coral-agents/`, and the
deterministic Coral round engine survives only as the documented-legacy
`services/coral` module behind `run_agent_round` until the intelligence
runtime replaces it (PR 5 of
[01-lean-e2e-architecture.md](../architecture/01-lean-e2e-architecture.md)).

This supersedes the six-role LLM market design in
`docs/architecture/rust-agents-plan.md`.

## Rationale

The hackathon tracks reward consumer UX, deterministic Web3 verification, and
actual autonomous operation. Fake role-play agents add complexity, confuse the
word "market" (Coral service marketplace vs prediction market vs odds market),
and make the demo harder to understand. Detection, risk gating, verification,
and settlement are deterministic modules - testable math, not LLM personas.

## Consequences

- The Agent track shows one production-shaped tool: observe -> decide -> act ->
  evaluate, with documented thresholds and SQLite-backed traces.
- Web3 verification and settlement are code-only, so receipts are trustworthy.
- Consumer mode stays simple and money-free.
- LLM usage narrows to explanation/narration behind strict-JSON guards with
  deterministic fallbacks (`services/llm`, PR 6); the Venice/Kimi client work
  from the superseded plan is reused there.
- Vocabulary rule repo-wide: only the intelligence runtime is called an agent;
  everything else is a service, engine, detector, policy, resolver, or narrator.
