# Improvement Plan for el-dorado-score-keeper

This document lists recommended improvements to the codebase, grouped by priority. Each entry contains the why, what to change, where to change (files / areas), suggested implementation approach, risk, and a rough effort estimate.

High Priority
-------------

- 1) Extract and simplify complex components
  - Why: `components/views/CurrentGame.tsx` (and similar files) is large, contains many responsibilities (rendering header, player cells, controls, responsive text fitting). Large components are hard to reason about and test.
  - What / Where: Break `CurrentGame` into smaller components: `RoundHeader`, `PlayerCell`, `PlayerControls`, `FitRow` -> `ui/FitRow.tsx` or `components/views/CurrentGame/RowCell.tsx`.
  - Implementation: Move UI fragments into pure functional components with props and explicit prop types. Keep minimal logic in parent and pass handlers via callbacks. Reuse the `FitRow` helper as a standalone component file and add tests for it.
  - Risk: Low. Improves maintainability and testability.
  - Effort: 2–4 hours.

- 2) Remove duplicated JSX paths for placeholder vs locked rows
  - Why: The same markup is duplicated for placeholder and locked states in `CurrentGame`. Duplication increases maintenance cost.
  - What / Where: Consolidate the two paths into a single rendering path; use a small utility `isPlaceholderOrLocked` or a component that encapsulates the display for empty cells.
  - Implementation: Replace duplicate fragments with a shared `EmptyCell` component.
  - Risk: Low.
  - Effort: 30–90 minutes.

- 3) Fix potential ResizeObserver / useLayoutEffect re-render loop in `FitRow`
  - Why: `useLayoutEffect` depends on `useAbbrev` state while the effect sets that state. That can cause extra re-renders and possibly repeated measurements.
  - What / Where: `components/views/CurrentGame.tsx` – `FitRow` component.
  - Implementation: Use a ref to track whether the component has switched to abbrev and avoid including `useAbbrev` in the dependency list. Or separate measurement and abbreviation into two stages and drive abbreviation from a ref or from measured font size rather than state in the same effect. Ensure the ResizeObserver and requestAnimationFrame are properly cleaned up (they are but be explicit). Add a unit test that asserts it does not loop on resize.
  - Risk: Low–Medium (subtle timing issues). Test carefully.
  - Effort: 1–2 hours.

Medium Priority
---------------

- 4) Stronger TypeScript types and stricter linting
  - Why: Some `any`/implicit types and overly broad state usage reduce compile-time guarantees.
  - What / Where: Enable `strict` in `tsconfig.json` (if not already). Add missing types across `state/*`, `lib/*`, and components. Add ESLint rule set (if not strict) and fix lint warnings.
  - Implementation: Enable `strict: true`, fix type errors incrementally, add `@typescript-eslint` rules, and run autofix where safe.
  - Risk: Medium (type fixes may require refactors).
  - Effort: 4–12 hours depending on current codebase coverage.

- 5) Memoize callbacks and avoid needless re-renders
  - Why: `CurrentGame` creates handlers inline (`incrementBid`, `decrementBid`, `toggleMade`, `cycleRoundState`) on every render. Passing them to many cells can cause re-renders even when not necessary.
  - What / Where: `components/views/CurrentGame.tsx` and other list-heavy components.
  - Implementation: Wrap handlers in `useCallback` and memoize derived props passed to mapped children. Consider `React.memo` for `PlayerCell`, `RoundHeader` components.
  - Risk: Low.
  - Effort: 1–2 hours.

- 6) Selector performance and memoization
  - Why: `selectCumulativeScoresAllRounds` and `selectRoundInfosAll` run on every state change; they might be expensive if they iterate over many rounds/players.
  - What / Where: `lib/state/selectors.ts`, `components/views/CurrentGame.tsx`.
  - Implementation: Implement memoized selectors (e.g., use `reselect` or internal memoization keyed by state object/modified fields). Only recompute when relevant slices change. Add unit tests validating selectors.
  - Risk: Low–Medium.
  - Effort: 2–6 hours.

Low Priority / Cleanup
----------------------

- 7) Consolidate styling tokens and reduce duplicate tailwind classes
  - Why: Repeated class strings create visual drift and make global theming harder.
  - What / Where: `components/*`, `styles/*`, tailwind config (if used). Create small utility classes or component wrappers for frequently used combinations (e.g., small button styles used repeatedly).
  - Effort: 2–6 hours.

- 8) Accessibility improvements
  - Why: Buttons and clickable divs need semantic markup, keyboard navigability, and ARIA labels. Click handlers exist on non-interactive elements (e.g., grid cells) which breaks accessibility and can be missed by screen readers.
  - What / Where: `components/views/CurrentGame.tsx`, `components/ui/*`.
  - Implementation: Replace clickable divs with buttons or add role/button + keyboard handlers (Enter/Space). Add aria-labels for controls and state changes, update color contrast. Run axe or similar a11y audits.
  - Risk: Low.
  - Effort: 2–4 hours.

Architecture / Product Level
---------------------------

- 9) Add end-to-end tests for main flows
  - Why: Current integration/unit tests are good, but adding user flows (bidding, completing round, finalizing) via Playwright or Cypress strengthens guarantees.
  - What / Where: `tests/` integration -> add Playwright suite, or expand existing integration tests to exercise DOM interactivity.
  - Implementation: Add Playwright with headless Chromium or use existing testing infra (Vitest + jsdom + testing-library) for DOM tests. Create canonical user scenarios.
  - Risk: Medium (test flakiness). Use stable selectors and test data.
  - Effort: 4–12 hours.

- 10) CI and pre-commit automation
  - Why: Ensure consistent formatting, linting, and tests before merging.
  - What / Where: Add GitHub Actions workflows for lint/test/build, add Husky + lint-staged to run ESLint/Prettier on commit.
  - Effort: 2–4 hours.

Developer Experience
-------------------

- 11) Improve local dev startup and scripts
  - Why: Provide clear commands for running tests, storybook, or a dev server.
  - What / Where: `package.json` scripts, `README.md` update.
  - Implementation: Add `pnpm dev`, `pnpm test:watch`, `pnpm lint`, `pnpm storybook` (if added). Document in README.
  - Effort: 1–2 hours.

- 12) Add Storybook for isolated component development
  - Why: Accelerates UI iteration and manual QA.
  - What / Where: `components/*` stories.
  - Effort: 4–8 hours.

Testing & Quality
-----------------

- 13) Add more unit tests for selectors and logic
  - Why: Business logic (scoring, round finalization, roundDelta) are core and should be well-covered.
  - What / Where: `lib/state/logic.ts`, `lib/state/selectors.ts`, `tests/unit`.
  - Implementation: Add Vitest unit tests that are deterministic and cover edge cases (negative scores, ties, missing players).
  - Effort: 2–6 hours.

- 14) Add property-based tests for state resilience
  - Why: This app relies on event sourcing and merging; property tests help validate invariants under random sequences.
  - What / Where: `tests/property` already exists; expand coverage.
  - Effort: 6–12 hours.

Observability & Reliability
---------------------------

- 15) Add runtime error handling and boundaries
  - Why: Prevent a single UI error from breaking the whole app.
  - What / Where: Wrap top-level UI (`app/layout.tsx` or root `StateProvider`) with React ErrorBoundary and log errors.
  - Implementation: Add an error boundary component and integrate with a logging backend (or console + debug endpoint).
  - Effort: 1–2 hours.

Small Enhancements
------------------

- 16) Improve naming & export conventions
  - Why: Keep imports short and consistent. Use `index.ts` barrels where appropriate.
  - What / Where: `components/*`, `lib/*`.
  - Effort: 1–3 hours.

- 17) Document state model and event contracts
  - Why: There are many state modules (`state/*`) and tests referencing event formats. A concise `STATE.md` exists; expand or keep up-to-date and add examples for event shapes.
  - Where: `lib/docs/STATE.md` (or `state/` docs).
  - Effort: 1–3 hours.

Prioritization Suggestions
--------------------------
1. High priority refactors (component extraction, Fix FitRow) — improves dev velocity and eliminates subtle bugs.
2. Selector memoization and useCallback — directly improves runtime performance.
3. Accessibility and tests — improves product quality and reduces regressions.
4. DX and CI — protects the repo going forward.

Next actionable steps (first 48 hours)
-------------------------------------
- Extract `FitRow` into `components/ui/FitRow.tsx` and add unit tests that assert it measures without entering a re-render loop.
- Split `PlayerCell` out of `CurrentGame` and `RoundHeader` into small components; add `React.memo` and use `useCallback` for handlers.
- Add a memoized selector implementation for `selectCumulativeScoresAllRounds`.
- Add small a11y fixes: replace clickable divs with buttons/roles and keyboard handlers for toggles.

If you want, I can:
- Generate a PR that performs the `FitRow` extraction and fixes the ResizeObserver dependency issue.
- Create a follow-up PR template that adds `useCallback`/`React.memo` around `PlayerCell` and consolidates duplicate JSX.

