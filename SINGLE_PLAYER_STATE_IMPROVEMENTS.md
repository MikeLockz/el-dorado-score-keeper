# Single‑Player State Improvements (Plan)

This document outlines changes to make the single‑player (SP) runtime fully resilient, event‑sourced, and aligned with the scorecard’s existing state patterns.

## Goals

- One source of truth for SP runtime (no local mirrors).
- Hard refresh resilience via the shared event store.
- No UI flicker or cross‑round leakage; predictable transitions.
- Clear, composable selectors for all SP views.

## Current State (after recent work)

- SP runtime lives in `state.sp` with events and reducers for: deal, phase, trick plays, trick clear, trump broken, and leader.
- Scorecard uses live overlay selectors; page uses `state.sp` for runtime.
- Headers use selectors for trump and dealer.

## Proposed Changes

### 1) State Model

- Single source of truth: remove remaining local mirrors for SP runtime (hands, trickPlays, trickCounts, trumpBroken, leader, phase). Keep only transient UI state (e.g., `selectedCard`).
- Remove localStorage snapshot (temporary stopgap) now that SP is in the store.
- Deterministic deals (optional): add `sp/seed-set { seed }` to record an RNG seed per session; use it to reproduce deals if you opt not to store hands. (Today hands are persisted, so seed helps primarily for debug/replay.)
- Session identity (optional): `sp/session-started { id, startedAt }` for archive/analytics.

### 2) Events & Reducers

- Batch appends: add an `appendMany([...events])` helper to coalesce multi‑step updates (e.g., confirm bid + auto‑bids + phase change) into one IndexedDB transaction to avoid intermediate renders and flicker.
- Idempotency: ensure all SP reducers are safe on duplicate/out‑of‑order replays; add tests.
- Lock transitions to events:
  - Drive UI via `sp/phase-set('bidding'|'playing'|'done')`.
  - Continue to emit `round/state-set` for scorecard rows, but append alongside `sp/phase-set` in a single batch to prevent toggles.
- Attendance (future): if supporting late/drop players, mirror presence via SP events, or rely on existing `round.present` if sufficient.

### 3) Selectors

- Existing:
  - `selectSpLeader`, `selectSpRotatedOrder`, `selectSpNextToPlay`, `selectSpLiveOverlay`.
  - `selectSpTrumpInfo`, `selectSpDealerName`.
- Add:
  - `selectSpIsRoundDone(s)`: true when sum of `sp.trickCounts` equals `tricksForRound(sp.roundNo)`.
  - `selectSpTricksForRound(s)`: proxy to `tricksForRound(sp.roundNo)`.
  - `selectSpHandBySuit(s, playerId)`: grouped hand view to simplify UI logic.

### 4) UI / Event Flow

- Confirm bid (bidding → playing): append in one batch
  - `bidSet(human)`, auto‑bid `bidSet` for bots missing bids, `sp/phase-set('playing')`, `round/state-set('playing')`.
- Trick resolution (during playing): append in one batch
  - `sp/trump-broken-set(true)` if applicable, `sp/trick/cleared { winnerId }`, `sp/leader-set { winnerId }`.
- Finalize round (playing → scored): append in one batch
  - all `madeSet`, `round/finalize`, optionally `sp/phase-set('done')`, and if auto‑advancing: next round `sp/deal`, `sp/phase-set('bidding')`, `round/state-set('bidding')`.

### 5) Consistency & UX

- Disable inputs while `appendMany` pending to prevent double‑triggers.
- Use selectors in all headers (already done for trump/dealer; first‑to‑act via `selectSpRotatedOrder[0]`).

### 6) Validation & Tests

- Reducers:
  - Deal → play → clear trick → phase transitions → finalize; idempotency; trump‑broken logic.
- Selectors:
  - Rotation, next‑to‑play, live overlay, trump info, dealer name, is‑round‑done.
- Integration:
  - Finish Round 10 → Round 10 remains scored; Round 9 becomes bidding; no flicker.
  - Refresh mid‑trick restores seamlessly from `state.sp`.

### 7) Archive & Restore

- Include `state.sp` snapshot metadata in archived bundle summary so sessions are inspectable.
- If replay is desired, rely on event log; SP state rehydrates deterministically.

### 8) Migration Cleanup

- Remove remaining local runtime writes from the page (hands/trickPlays/trickCounts/trumpBroken) — use only `events.sp*`.
- Standardize batch appends for the three key transitions (confirm bid, clear trick, finalize round).
- Keep top and scorecard headers fully selector‑driven (done for trump/dealer/lead; ensure first‑to‑act uses `selectSpRotatedOrder`).

## Next Steps (Suggested Order)

1. Implement `appendMany([...events])` helper and switch confirm‑bid/trick‑clear/finalize flows to it.
2. Add `selectSpIsRoundDone`, `selectSpTricksForRound`, `selectSpHandBySuit` and refactor components to use them.
3. Remove localStorage snapshot and any remaining local runtime state writes.
4. Add unit/integration tests for SP reducers/selectors and end‑to‑end flows.
5. (Optional) Add session seed / session‑started events for reproducibility and archive UX.

---

These changes complete the move to a fully event‑sourced SP runtime, eliminate flicker by batching transitions, and simplify UI via selectors. The result is resilient, testable, and consistent with existing scorecard patterns.
