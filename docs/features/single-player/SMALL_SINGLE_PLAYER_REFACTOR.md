# Small Single‑Player Refactor

Goal: clarify the separation of Single‑Player (SP) runtime from global scorekeeper logic with minimal risk and zero behavior changes. Keep diffs small, shippable step‑by‑step, with validation and a commit after each step.

## Scope & Constraints

- Preserve all runtime behavior and event shapes (`sp/*`, `bid/set`, `round/state-set`, etc.).
- No feature flags; maintain backwards‑compatible exports.
- Keep `state.sp` as the single source of truth for the SP runtime.
- Favor pure utilities and selectors over component‑embedded logic.

## Target Architecture (Incremental)

- Keep `AppState.sp` for SP runtime: `phase`, `roundNo`, `order`, `hands`, `trickPlays`, `trickCounts`, `trump`, `trumpCard`, `trumpBroken`, `leaderId`.
- Split SP selectors into `lib/state/selectors-sp.ts` (re‑exported from the existing barrel to avoid breaking imports).
- Introduce a small, pure SP engine module `lib/single-player/engine.ts` that returns event batches (does not perform side effects).
- Replace the large effects in `app/single-player/page.tsx` with a dedicated hook `lib/single-player/use-engine.ts` that coordinates the engine and dispatches event batches.

## Step‑by‑Step Plan

Each step includes validation and suggested commit message. Run commands as applicable to your setup (e.g., `pnpm`/`npm`/`yarn`).

### 1) Split SP selectors into a dedicated module

Move the following from `lib/state/selectors.ts` to a new file `lib/state/selectors-sp.ts`:

- `selectSpRotatedOrder`
- `selectSpNextToPlay`
- `selectSpLeader`
- `selectSpLiveOverlay`
- `selectSpTrumpInfo`
- `selectSpDealerName`
- `selectSpTricksForRound`
- `selectSpIsRoundDone`
- `selectSpHandBySuit`

Then:

- Add barrel re‑exports in `lib/state/index.ts` (or existing barrel) to keep current import paths working.
- Update any intra‑repo relative imports that directly referenced `selectors.ts` for SP selectors to use the barrel (preferred) or `selectors-sp.ts`.

Validation:

- Typecheck: `pnpm typecheck` (or `npm run typecheck`).
- Unit tests: `pnpm test -w tests/unit/selectors-sp.test.ts` and a full run.

Commit:

- Message: "refactor(sp): move SP selectors into selectors-sp.ts and re-export"

### 2) Introduce a pure SP engine API

Create `lib/single-player/engine.ts` with pure functions that take `AppState` and return arrays of `AppEvent` (via `events.*`) without mutating state or dispatching:

Proposed API (can evolve):

- `prefillPrecedingBotBids(state: AppState, roundNo: number, humanId: string, rng: () => number): AppEvent[]`
  - Uses existing `computePrecedingBotBids` to produce `events.bidSet(...)` for bots before the human.
- `computeBotPlay(state: AppState, playerId: string, rng: () => number): AppEvent[]`
  - When it’s `playerId`’s turn, returns a single `sp/trick/played` event using existing bot logic, or `[]` if not applicable.
- `resolveCompletedTrick(state: AppState): AppEvent[]`
  - If the current trick is complete, emits `[sp/trump-broken-set? , sp/trick/cleared, sp/leader-set]` (idempotent when no plays).
- `finalizeRoundIfDone(state: AppState): AppEvent[]`
  - When `sum(sp.trickCounts) === tricksForRound(sp.roundNo)`, generate the batch to reconcile SP -> scorekeeper: per‑player `made/set`, `round/finalize`, `sp/phase-set('done' | 'bidding')` as today’s page logic dictates; return `[]` otherwise. Keep this faithful to current implementation semantics.

Notes:

- All functions must be deterministic given inputs and never access timers or globals.
- Preserve turn‑order enforcement, idempotency, and trump‑broken semantics already in the reducer.

Add tests `tests/unit/sp-engine.test.ts`:

- `prefillPrecedingBotBids` produces correct bids only for players before the human.
- `computeBotPlay` returns one `sp/trick/played` with a legal card for the bot.
- `resolveCompletedTrick` emits winner batch only when a full trick exists; includes `sp/trump-broken-set` when off‑suit trump played.
- `finalizeRoundIfDone` emits expected scoring/finalization batch.

Validation:

- Typecheck and run just the new tests first, then full suite.

Commit:

- Message: "feat(sp-engine): add pure SP engine utilities and unit tests"

### 3) Extract orchestration into a hook

Create `lib/single-player/use-engine.ts`:

- Expose `useSinglePlayerEngine({ state, appendMany, rng, humanId })`.
- Internally, replicate the three existing effects from `app/single-player/page.tsx` using the engine functions to generate batches, then dispatch via `appendMany`.
- Guard on `state.sp.phase` and `isBatchPending` exactly as today; do not change timings except for moving setTimeout delays alongside dispatches.

Refactor `app/single-player/page.tsx`:

- Remove the body of the effects that coordinate bot play, trick resolution, and round finalization.
- Call `useSinglePlayerEngine(...)` with the same inputs and keep UI intact.

Validation:

- Typecheck and run all unit tests.
- Manual smoke: play a round in single‑player, observe bids, plays, trick resolution, and scoring update unchanged.

Commit:

- Message: "refactor(sp): extract single-player orchestration into useSinglePlayerEngine"

### 4) Naming consistency within SP UI

Standardize local naming in `app/single-player/page.tsx`:

- Keep `sp*` prefix for locals derived from `state.sp` when the file mixes SP and global state (e.g., `spOrder`, `spHands`, `spLeaderId`, `spTrumpBroken`).
- Ensure dependency arrays reflect renamed identifiers.

Validation:

- Typecheck.
- Quick grep for lingering old names (e.g., `trickLeader`).

Commit:

- Message: "chore(sp): normalize single-player local naming for clarity"

### 5) Documentation and barrels

Docs:

- Add a short section to this file (end) summarizing the engine, selectors split, and refactor rationale.

Barrels:

- Ensure `lib/state/index.ts` and `lib/single-player/index.ts` re‑export the new modules so external imports remain stable.

Validation:

- Typecheck.

Commit:

- Message: "docs(sp): document SP engine and selectors split; ensure barrels export"

### 6) Idempotency and invariants

Augment tests to enforce existing guarantees:

- Out‑of‑turn `sp/trick/played` remains ignored (reducer contract already enforces; add explicit engine tests).
- Duplicate clear on empty trick is a no‑op (already enforced; test).
- `selectSpIsRoundDone` flips true exactly when counts meet `tricksForRound(sp.roundNo)`; ensure engine doesn’t emit finalize early.

Validation:

- Run `pnpm test`.

Commit:

- Message: "test(sp): strengthen idempotency and invariant coverage"

## Rollback Plan

- Each step is isolated; revert by `git revert <commit>` for the step.
- If the engine or hook causes issues, revert steps 2–3 and 4, keeping the selectors split (step 1) which is low‑risk.

## Risks & Mitigations

- Hidden behavioral drift: Mitigate with unit tests mirroring current flows and manual smoke.
- Import churn: Use barrel re‑exports to avoid breaking paths; prefer centralized imports (`lib/state`).
- Timing sensitivity in effects: Preserve current delays; avoid introducing new async boundaries.

## Commands Reference (adjust to your tooling)

- Typecheck: `pnpm typecheck` or `npm run typecheck`
- Tests: `pnpm test` or `npm test`
- Lint/format: `pnpm lint` / `pnpm format`

## Appendix: Example Engine Signatures

```ts
// lib/single-player/engine.ts
export function prefillPrecedingBotBids(
  state: AppState,
  roundNo: number,
  humanId: string,
  rng: () => number,
): AppEvent[] {
  /* ... */
}

export function computeBotPlay(state: AppState, playerId: string, rng: () => number): AppEvent[] {
  /* ... */
}

export function resolveCompletedTrick(state: AppState): AppEvent[] {
  /* ... */
}

export function finalizeRoundIfDone(state: AppState): AppEvent[] {
  /* ... */
}
```

## Done Criteria

- All tests pass; manual single‑player flow behaves exactly as before.
- SP selectors live in `selectors-sp.ts` with stable re‑exports.
- `app/single-player/page.tsx` uses `useSinglePlayerEngine`.
- Documentation in this file reflects the final structure.

## Final Structure Summary

- `state.sp`: authoritative SP runtime fields (phase, roundNo, order, hands, trickPlays, trickCounts, trump, trumpCard, trumpBroken, leaderId).
- `lib/state/selectors-sp.ts`: all SP selectors and types; re-exported via the state barrel.
- `lib/single-player/engine.ts`: pure, deterministic helpers that return event batches for bidding prefill, bot plays, trick resolution, and round finalization.
- `lib/single-player/use-engine.ts`: React hook that coordinates engine outputs with store dispatch and UI-friendly delays; used by `app/single-player/page.tsx`.
- Barrels (`lib/state/index.ts`, `lib/single-player/index.ts`): re-export SP modules to keep imports stable.

Rationale: isolates SP orchestration from UI and from global scorekeeper logic, promotes testable, pure functions, and reduces component complexity without behavior changes.
