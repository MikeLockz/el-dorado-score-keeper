# IMPLEMENT_CONTINUE_GAME_OR_START_NEW

This rollout plan translates the product/documentation requirements from `CONTINUE_GAME_OR_START_NEW.md` into concrete engineering work. Implementation is partitioned into clear phases; each phase ends with validation (functional checks plus `pnpm lint`, `pnpm format`, `pnpm test`) and a dedicated git commit.

## Tooling Baseline

- Commands used at every phase boundary:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm test`
- All new functionality must ship with unit/integration coverage per the instructions below.

## Phase 1 – Shared Detection & Request Abstractions

**Goal:** establish reusable primitives (`hasInProgressGame`, `useNewGameRequest`) and validate them in isolation.

### Tasks

- Add a new module (e.g., `lib/game-flow/new-game.ts`) exporting:
  - `hasInProgressGame(state: AppState): boolean` using the heuristics documented previously.
  - `useNewGameRequest(options)` hook responsible for:
    - Inspecting live state via `useAppState()`.
    - Respecting `options.requireIdle` / `options.onBeforeStart` if we need integration flexibility.
    - Prompting via a shared confirmation surface (see Phase 2) when `hasInProgressGame` is true.
    - Sequencing `archiveCurrentGameAndReset` and exposing `{ startNewGame, pending }`.
- Ensure `useNewGameRequest` listens for storage/broadcast `reset` events so the hook clears its pending state if another tab triggers the reset.

### Tests

- Unit tests under `tests/unit/game-flow/` covering:
  - `hasInProgressGame` false positives (fresh DB, locked rounds only) and positives (bids/made set, SP phase mid-hand).
  - Hook behavior via React Testing Library + `vitest` using a harnessed `StateProvider`:
    - No confirmation when `hasInProgressGame` returns false.
    - Confirmation path invoked when predicate is true and respects cancel/confirm responses.
    - Pending flag guards concurrent invocations.

### Validation & Commit

1. Ensure `pnpm format` yields no diff.
2. Run `pnpm lint` and `pnpm test` (including new suites).
3. Capture results in the commit message body if desired.
4. Commit with a message like `feat(game-flow): add new game request helpers`.

## Phase 2 – Confirmation UI & Surface Integrations

**Goal:** deliver consistent UI/UX wherever a new game can be triggered.

### Tasks

- Build a shared confirmation dialog component if one does not already exist (e.g., `components/dialogs/NewGameConfirm.tsx`) using shadcn primitives. Accept props for copy overrides so future modes can reuse it.
- Wire the dialog into `useNewGameRequest` (Phase 1) via a promise-based API. For minimal surface area:
  - Expose `showConfirmDialog` through context (e.g., add to `StateRoot`) or colocate within the hook using a `useState` + deferred promise pattern.
- Update existing entry points to use the hook:
  - `components/views/SinglePlayerMobile.tsx`: replace direct `archiveCurrentGameAndReset` with `startNewGame`; pass `disabled={pending || isBatchPending}` to the CTA.
  - `app/games/page.tsx`: swap `onNewGame` implementation to call `startNewGame` and navigate only on success.
  - Audit other routes for future triggers and stub TODO comments if needed (scorecard toolbar, devtools, etc.).
- Guard against time-travel preview by reading live state (`timeTravelHeight === null`); the hook should fall back to the subscribed state from `StateProvider`.

### Tests

- Add UI-level tests:
  - Update existing `tests/ui/sp-game-summary-ui.test.ts` to assert the confirmation dialog shows when there is in-progress state (inject via test harness) and that confirming triggers the archive mock.
  - New integration test for `/games` page ensuring the modal appears and respects cancel/confirm flows.
  - Snapshot/dialog tests as needed to freeze copy.

### Validation & Commit

1. `pnpm format`
2. `pnpm lint`
3. `pnpm test`
4. Commit: `feat(game-flow): confirm before starting new game`

## Phase 3 – Hardening, Telemetry, and Developer Hooks

**Goal:** polish edge cases and prepare for future modes.

### Tasks

- Extend the hook to emit optional telemetry (e.g., via existing analytics module) for confirm/cancel metrics.
- Add a dev-only escape hatch (`globalThis.__START_NEW_GAME__`) that delegates to `startNewGame` for debugging (registered inside the hook when NODE_ENV !== 'production').
- Update documentation (`CONTINUE_GAME_OR_START_NEW.md`) to reflect any API nuances discovered during implementation.
- Review multi-tab behavior manually: open two tabs, begin a game, trigger reset in tab A, verify tab B resets without modal residue. Capture findings in docs or inline comments.

### Tests

- Telemetry behavior can be covered with spy assertions in unit tests.
- Add regression tests for the broadcast listener (simulate `storage`/`postMessage`).

### Validation & Commit

1. `pnpm format`
2. `pnpm lint`
3. `pnpm test`
4. Commit: `chore(game-flow): harden new game workflow`

## Phase 4 – Rollout Verification & Clean-up

**Goal:** confirm the end-to-end experience and tidy ancillary assets.

### Tasks

- Execute exploratory testing across devices (mobile/desktop) focusing on:
  - Single-player flow mid-hand, summary, and fresh start.
  - Games dashboard navigation after archival.
  - Behavior when IndexedDB operations fail (simulate via DevTools/Application).
- Update release notes / CHANGELOG if required.
- Remove deprecated code paths or feature flags related to legacy new-game triggers.

### Validation & Commit

- Final `pnpm format`, `pnpm lint`, `pnpm test` sweep.
- Commit: `docs(game-flow): finalize new game rollout` (if changes are doc-only).

## Phase Completion Checklist

- [x] Phase 1 commit merged (helpers + tests)
- [ ] Phase 2 commit merged (UI integrations + tests)
- [ ] Phase 3 commit merged (hardening + telemetry)
- [ ] Phase 4 commit merged (verification + cleanup)
- [ ] Stakeholders notified and documentation updated (README/CHANGELOG as appropriate)
