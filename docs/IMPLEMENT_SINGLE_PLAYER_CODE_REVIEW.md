**Implement Single-Player Code Review**

This plan breaks the recommendations in SINGLE_PLAYER_CODE_REVIEW.md into incremental, verifiable phases. Each phase includes scope, files, tests to add/update, and validation steps. Run lint, type-check, format, and tests before moving on. Commit after each phase.

Conventions

- Commands: `pnpm lint`, `pnpm typecheck` (if available; else `tsc -p tsconfig.json --noEmit`), `pnpm test`, `pnpm format`.
- Test locations: `tests/unit/*`, `tests/ui/*`, `tests/integration/*` as appropriate.
- Keep changes small; do not mix phases.

Phase 1: RNG Reuse + Page Cleanup

- Goal: Remove duplicate mulberry32 and unused state; improve clarity with deterministic RNG setup.
- Changes:
  - Replace inline RNG in `app/single-player/page.tsx` with `mulberry32` from `lib/single-player/rng.ts` (re-exported by `lib/single-player/index.ts`).
  - Remove unused `playersCount` and any dead local state/comments.
  - Optional: add small utility `useDeterministicRng(seed)` if desired (skip if not needed now).
- Files:
  - `app/single-player/page.tsx`
- Tests:
  - Add `tests/unit/sp-rng-wireup.test.ts` verifying that given a seed, two RNGs produce same first N numbers and are used to seed bot bidding deterministically (mock bots to assert RNG is plumbed).
- Validation:
  - `pnpm lint && pnpm test` (UI tests should remain green).
  - `pnpm format` if needed.
- Commit:
  - Message: "SP: reuse mulberry32 RNG; remove dead state in page"

Phase 2: Prevent Recompute Of Advance Batch In UI

- Goal: Avoid calling `computeAdvanceBatch` multiple times per render.
- Changes:
  - In `components/views/SinglePlayerMobile.tsx`, compute `advanceBatch` with `useMemo`. Use it for disabled, aria-disabled, and onClick.
- Files:
  - `components/views/SinglePlayerMobile.tsx`
- Tests:
  - Update/extend `tests/ui/sp-reveal-finalize-flow.test.ts` to ensure button enabled/disabled still follows the same logic.
  - Add a lightweight test `tests/unit/sp-advance-batch-memo.test.ts` to assert the callback uses the memoized batch (spy on `appendMany`).
- Validation:
  - `pnpm lint && pnpm test`.
- Commit:
  - Message: "SP UI: memoize computeAdvanceBatch usage; avoid repeated calls"

Phase 3: Extract buildNextRoundDealBatch

- Goal: Single source of truth for constructing the next-round deal batch.
- Changes:
  - Add helper in `lib/single-player/engine.ts`: `buildNextRoundDealBatch(state, now, useTwoDecks?)` that returns `[spDeal, spLeaderSet, spPhaseSet('bidding'), roundStateSet('bidding')]`.
  - Refactor `computeAdvanceBatch` and `finalizeRoundIfDone` to call this helper instead of duplicating logic.
  - Do not change behavior (ensure same payloads and order).
- Files:
  - `lib/single-player/engine.ts`
- Tests:
  - Extend `tests/unit/sp-engine.test.ts` with new cases:
    - Ensure `computeAdvanceBatch` uses the helper by verifying event types and order match previous behavior.
    - Ensure `finalizeRoundIfDone` still emits the same next-round events and order when applicable.
- Validation:
  - `pnpm lint && pnpm test`.
- Commit:
  - Message: "SP Engine: extract buildNextRoundDealBatch and refactor callers"

Phase 4: Rules Consolidation Facade

- Goal: Remove logic drift by centralizing SP rules. Start with a facade to minimize churn.
- Changes:
  - Create `lib/rules/sp.ts` that re-exports canonical rule functions:
    - From `lib/state/spRules.ts`: `nextToAct`, `isRoundDone`, `canPlayCard`.
    - From `lib/single-player/trick.ts`: `ledSuitOf`, `trickHasTrump`.
  - Update consumers (UI legality checks and any engine references) to import from `lib/rules/sp`.
  - Do not delete old modules yet; this phase switches read-sites.
- Files:
  - `lib/rules/sp.ts` (new)
  - `components/views/SinglePlayerMobile.tsx` (replace local `canPlayCard` logic to call `canPlayCard` rule)
- Tests:
  - Add `tests/unit/sp-rules-facade.test.ts`:
    - Asserts `canPlayCard` disallows leading trump when not broken and a non-trump exists.
    - Requires following suit when possible; allows any card otherwise.
  - Update UI tests if they depended on old UI-side legality (should be unchanged behaviorally).
- Validation:
  - `pnpm lint && pnpm test`.
- Commit:
  - Message: "SP Rules: add facade lib/rules/sp and route UI legality checks through it"

Phase 5: Tighten Card/Rank/Suit Types Across State

- Goal: Remove `any` casts by unifying types.
- Changes:
  - In `lib/state/types.ts`, import `Rank` and `Suit` from `lib/single-player/types` and narrow `sp.trumpCard`, `sp.hands`, and `sp.trickPlays` to use those unions.
  - Fix type errors in `app/single-player/page.tsx` and `components/views/SinglePlayerMobile.tsx` by removing `as any` and aligning signatures.
- Files:
  - `lib/state/types.ts`
  - `app/single-player/page.tsx`
  - `components/views/SinglePlayerMobile.tsx`
- Tests:
  - Type-only; ensure `pnpm typecheck` passes.
  - Run entire test suite to catch regressions.
- Validation:
  - `pnpm typecheck && pnpm lint && pnpm test`.
- Commit:
  - Message: "SP Types: unify Card/Rank/Suit across state; remove casts"

Phase 6: Remove sp/ack-set (if unused)

- Goal: Remove vestigial `ack` state and event.
- Changes:
  - Delete `sp/ack-set` from `EventMap`, validation schema, and events exporter.
  - Remove `sp.ack` from `AppState.sp` and `INITIAL_STATE`.
  - Remove the two `spAckSet` calls in `lib/single-player/engine.ts`.
  - Search and clean references.
- Files:
  - `lib/state/types.ts`
  - `lib/state/validation.ts`
  - `lib/state/events.ts`
  - `lib/single-player/engine.ts`
- Tests:
  - Update any tests asserting presence of `ack` or `spAckSet` emission (likely none in current suite).
  - Add `tests/unit/sp-ack-removed.test.ts` to assert end-to-end reveal/clear flow without needing `ack`.
- Validation:
  - `pnpm lint && pnpm test`.
- Commit:
  - Message: "SP: remove unused ack event/state; rely on reveal gating"

Phase 7: Modularize SinglePlayerMobile

- Goal: Improve readability by splitting the monolith into components.
- Changes:
  - Extract presentation components:
    - `components/views/sp/SpHeaderBar.tsx`
    - `components/views/sp/SpTrickTable.tsx`
    - `components/views/sp/SpHandDock.tsx`
    - `components/views/sp/SpRoundSummary.tsx`
    - `components/views/sp/SpGameSummary.tsx`
  - Keep logic in `SinglePlayerMobile` orchestrator; move minimal props to children; prefer selectors for data.
  - Ensure aria labels and accessibility remain intact.
- Files:
  - `components/views/SinglePlayerMobile.tsx` (refactor)
  - New files under `components/views/sp/*`
- Tests:
  - Update UI tests referencing internal structure if necessary:
    - `tests/ui/sp-summary-ui.test.ts`
    - `tests/ui/sp-game-summary-ui.test.ts`
    - `tests/ui/sp-reveal-finalize-flow.test.ts`
- Validation:
  - `pnpm lint && pnpm test`.
- Commit:
  - Message: "SP UI: split SinglePlayerMobile into focused subcomponents"

Phase 8: Performance Tweaks

- Goal: Small optimizations without behavior changes.
- Changes:
  - Memoize expensive derived values where used multiple times (e.g., `rotated`, `overlay` if needed).
  - Optionally dynamic-import bots on SP routes if bundle size matters (guarded behind phase flag to test impact).
- Files:
  - `components/views/SinglePlayerMobile.tsx`
  - Possibly `app/single-player/page.tsx`
- Tests:
  - No behavior change; rely on existing suite.
- Validation:
  - `pnpm lint && pnpm test`.
- Commit:
  - Message: "SP: memoize repeated derived values; optional dynamic bot import"

Phase 9: Documentation Pass

- Goal: Update docs to reflect consolidated rules, engine helper, type tightening, and UI structure.
- Changes:
  - Update `SINGLE_PLAYER_CODE_REVIEW.md` status/notes.
  - Add a brief section to `SINGLE_PLAYER_UI_IMPROVEMENTS_IMPLEMENTATION.md` about the new components and flow.
  - If rules facade created, add `docs/` note: "SP rules live under `lib/rules/sp`".
- Files:
  - `SINGLE_PLAYER_CODE_REVIEW.md`
  - `SINGLE_PLAYER_UI_IMPROVEMENTS_IMPLEMENTATION.md` (appendendum)
  - New or updated doc under `docs/` if needed
- Tests:
  - None.
- Validation:
  - `pnpm lint` (docs unaffected), run tests to be safe.
- Commit:
  - Message: "Docs: reflect SP rules/engine helpers, UI structure"

Appendix: Rollback Strategy

- Each phase is isolated and can be reverted individually with `git revert <commit>` if a regression is found.
- Prioritize keeping tests green in intermediate states; avoid partially applying a phase.

Appendix: Suggested New Tests Summary

- `tests/unit/sp-rng-wireup.test.ts`: deterministic RNG wiring.
- `tests/unit/sp-advance-batch-memo.test.ts`: memoized advance batch usage.
- `tests/unit/sp-rules-facade.test.ts`: legality rules behavior.
- `tests/unit/sp-ack-removed.test.ts`: reveal/clear flow without ack.
- Extend existing `tests/unit/sp-engine.test.ts` for next-round batch helper.
