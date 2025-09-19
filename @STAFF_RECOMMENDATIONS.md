# Staff Recommendations

## Architecture & Domain Modeling
- **Modularize event reducer**: `lib/state/types.ts:1-400` holds types, initial state, and a multi-hundred-line reducer. Extract domain slices (e.g., `scorecardReducer`, `rosterReducer`, `spReducer`) that each export pure `reduce` + selectors, then compose them via a root reducer. This clarifies ownership, enables targeted unit tests, and lets future contributors reason about a single domain without scrolling a monolith.
- **Define an event catalog package**: Convert `lib/state/events.ts` + `EventMap` into a generated contract (e.g., `zod` schemas per event type). Emit TS types and validation from the same source so contract changes flow to the worker (`cloudflare/analytics-worker`) and client without drift.
- **Promote roster domain**: Folder `lib/roster` contains ops but is invoked from state reducer. Move roster commands/queries into a dedicated module (commands that emit events, queries that read selectors) and expose a UI-facing service layer. This reduces direct IndexedDB coupling in components and clarifies single-player vs scorecard concerns.
- **Encapsulate single-player orchestration**: `app/single-player/page.tsx:20-220` mixes RNG, persistence, and view logic. Wrap orchestration into `useSinglePlayerSession` hook returning an immutable snapshot + command functions. Views then focus on rendering. Doing so will unblock reuse for desktop/tablet layouts and reduce re-render churn.

## State Persistence & Performance
- **Replace per-player seeding loop**: `components/state-provider.tsx:155-182` appends four events one-by-one on first mount, incurring four IndexedDB writes and UI suspense. Batch the seed with `appendMany` and guard it behind an explicit onboarding flow (so production rosters aren’t polluted with placeholder ids). Provide a migration script that backfills existing installs.
- **Tune snapshot strategy heuristics**: `lib/state/instance.ts:60-170` selects snapshot cadence by total event count without measuring perf. Instrument `applyChain` to record rehydrate/apply timings and persist metrics (e.g., via `performance.mark`). Use that data to auto-adjust `snapshotEvery` and clean up old snapshots more aggressively when replay exceeds ~50 ms.
- **Memoize heavy selectors**: `selectSpHandBySuit` and `selectSpTricksForRound` recompute on every render (`app/single-player/page.tsx:45-120`). Wrap them with `createSelector` (Reselect-style) so they cache by state slice; this keeps render cost stable on mobile devices.
- **Virtualize score grid**: `components/views/CurrentGame.tsx:170-360` renders all rounds/players and performs ResizeObserver-driven font fitting per cell. Replace custom `FitRow` logic with CSS truncation + tooltip, and optionally virtualize rows (React Virtual/`@tanstack/react-virtual`) once rounds exceed viewport. This trims layout thrash on low-power tablets.

## Frontend Architecture & UX
- **Responsive navigation**: `components/header.tsx:11-106` always shows a dropdown, forcing extra taps on desktop. Render an inline nav bar ≥ md breakpoint and reserve dropdown for narrow viewports. Ensure focus management and aria roles cover both layouts.
- **Action modals instead of confirm()**: `app/games/page.tsx:55-153` relies on blocking `confirm()` which breaks theming and accessibility. Replace with Radix AlertDialog confirm flows so keyboard users get consistent focus traps and we can add descriptive copy.
- **Progressive loading states**: Games list and scorecard currently jump from “Loading…” to full table. Add skeleton rows and optimistic updates (e.g., show archived game immediately on archive) to minimize perceived latency.
- **Audit color contrast & tokens**: Several muted states (e.g., scorecard row states in `CurrentGame.tsx:41-68`) use low-contrast combinations. Define a semantic token palette in Tailwind config (`styles` folder) and reference tokens instead of hard-coded classes.

## Developer Experience & Tooling
- **Adopt domain generators**: Provide `pnpm generate:event roster/playerAdded` style scripts that scaffold reducers, validators, and tests. This prevents forgotten validation updates when adding new events.
- **Storybook for shared UI**: Components under `components/ui` and `components/views/sp` lack isolated docs. Add Storybook with play functions to document interplay with state selectors; this doubles as visual regression coverage (Chromatic or Loki).
- **Strengthen absolute imports**: TS config already maps `@/`. Extend ESLint rule to forbid relative traversals beyond `../..` for shared libs to keep boundaries clear.
- **Document state debug hooks**: `StateProvider` exposes `globalThis.__append` etc. Ship a short `docs/debugging.md` that explains usage, lifecycle, and how to disable in prod builds.

## Testing & Quality
- **Add end-to-end coverage**: Vitest suite is comprehensive at unit level, but we lack happy-path automation for flows like “score a round” or “complete single-player run”. Introduce Playwright tests that run against `next dev` with seeded IndexedDB fixtures; assert on persisted rosters and archived games.
- **Regression snapshots for reducers**: The event-sourced model benefits from golden-state fixtures. Capture canonical event logs (JSON) and run reducer replays in tests to detect accidental behavior drift when refactoring domain slices.
- **Worker contract tests**: Mirror the analytics worker DTOs in client tests (e.g., ensuring payload schemas match). Use Vitest’s `describe.each` to verify that refactors to analytics payload keep required fields before deploying worker.
- **Mutation testing pilot**: Enable `vitest --mutation` (via Stryker) on core logic files (`lib/state/logic.ts`, `lib/single-player/rules.ts`) once per week to surface unasserted branches.

## CI/CD & Release
- **Run type-check & build in CI**: `.github/workflows/test.yml` skips `pnpm typecheck` and `pnpm build`, allowing invalid Next routing or `app/` imports to merge. Add dedicated jobs that ensure production build succeeds before deploy workflows.
- **Share pnpm cache across jobs**: Each job repeats `pnpm install`. Use a reusable workflow or `actions/cache` keyed by `pnpm-lock.yaml` to cut ~2 minutes from pipelines.
- **Preview deploy gating**: Add a “preview” job that runs Lighthouse CI against the static export. Fail PRs that regress performance budgets (TTI, CLS) beyond agreed thresholds.
- **Worker deployment safety**: `cloudflare/analytics-worker` deploys independently; add contract tests + versioned changelog so frontline engineers know when to update tokens/env vars.

## Product & Analytics Opportunities
- **Guided onboarding**: Instead of auto-seeding “Player 1–4”, offer an onboarding wizard that sets roster name, player count, and desired mode. Persist tutorial completion to skip future hints.
- **Session analytics**: Pipe key events (round finalized, single-player run completed) through the analytics worker with anonymized IDs. This informs balancing work and surfaces crashy flows.
- **Offline export UX**: Expose “Export game log (JSON/CSV)” from scorecard view using `exportBundle` (`lib/state/io.ts:20-120`). Pair with import in settings so players can transfer sessions between devices.
- **Accessibility review**: Run axe against primary pages, fix announced labels (e.g., ensure skip link targets dynamic root, add live region for score updates) to reach AA compliance.
