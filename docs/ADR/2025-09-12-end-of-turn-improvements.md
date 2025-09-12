# ADR: End-of-Turn Improvements (Single Player)

- Status: accepted
- Date: 2025-09-12

## Context

We will implement end-of-turn improvements for single player to simplify flows and make them more reliable and mobile-friendly. The work is tracked in:

- END-OF-TURN-IMPROVEMENTS.md (spec)
- IMPLEMENT_END-OF-TURN-IMPROVEMENTS.md (implementation plan)

Current state and selectors relevant to end-of-turn:

- State fields: `sp.phase`, `sp.trickPlays`, `sp.trickCounts`, `sp.trumpBroken`, `sp.leaderId`, `sp.reveal`, `sp.ack`, and round data in `rounds`.
- Selectors touched by turn boundaries: `selectSpIsRoundDone`, `selectSpIsLastTrick`, `selectSpNextToPlay`, `selectSpRotatedOrder`.

## Decision

Proceed with the phased plan to: centralize next-action computation in the engine, keep reducer apply-only with idempotency, and introduce a summary phase and snapshot banner. UI will drive progression by appending batches from `computeAdvanceBatch(state, now)`.

## Consequences

- Improves clarity and testability of end-of-turn logic.
- Enables pausing during reveal/summary and optional auto-advance.
- Requires incremental state scaffolding and new unit/integration coverage.
