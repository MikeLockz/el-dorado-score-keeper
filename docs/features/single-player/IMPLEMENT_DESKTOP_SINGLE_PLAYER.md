# IMPLEMENTATION PLAN — Desktop Single Player

A phased plan to deliver the desktop experience described in DESKTOP_SINGLE_PLAYER.MD. Each phase focuses on maintainable abstractions, parity with mobile, and accessible UI while keeping state orchestration consistent. After every phase: validate scope completion, run `pnpm format`, `pnpm lint`, `pnpm test`, and commit before moving forward.

—

## Tech/Conventions To Follow

- Framework: Next.js App Router (TypeScript, React 19)
- State: `components/state-provider`, selectors in `lib/state`, single-player engine utilities in `lib/single-player`
- Styling: Tailwind design tokens already configured (`bg-card`, `text-muted-foreground`, `min-h-dvh`, etc.)
- UI primitives: reuse `SpTrickTable`, `SpHandDock`, `SpRoundSummary`, `SpGameSummary`, and shared `CardGlyph`
- Tests: Vitest with jsdom (`tests/ui/**`), unit tests for selectors/helpers (`tests/unit/**`)
- Accessibility: prefer semantic landmarks, focus-visible states, live regions for announcements

—

## Phase 1 — Extract Shared Single-Player View Model ✅ (done)

Scope

- Factored the orchestration shared between mobile/desktop into `useSinglePlayerViewModel`, consolidating selectors, computed props, and actions (`components/views/sp/useSinglePlayerViewModel.ts`).
- Updated `SinglePlayerMobile` to consume the hook, removing duplicated state derivations.

Acceptance

- Mobile view compiles and existing UI tests pass without behavioural regressions.

Tests

- Added `tests/unit/single-player/view-model.test.ts` covering derived state snapshots and bid batch calculation.

Commit

- `refactor(sp): share single-player view model`

—

## Phase 2 — Implement Desktop View Component ✅ (done)

Scope

- Rewired `SinglePlayerDesktop` to the shared view model, ensuring layout-specific structure persisted while removing duplicated state logic.
- Ensured accessibility features (live regions, focus-visible styles) remain intact.

Tests

- Added `tests/ui/sp-desktop-ui.test.tsx` to assert trump toggle, CTA wiring, and shared data usage.

Commit

- `feat(sp): align desktop view with shared model`

—

## Phase 3 — Integrate Responsive View Selection ✅ (done)

Scope

- Updated `app/single-player/page.tsx` to render desktop or mobile view via `matchMedia('(min-width: 1024px)')`, with server-safe mobile fallback.

Tests

- Added `tests/ui/sp-page-responsive.test.tsx` to cover both desktop (matchMedia true) and mobile fallback cases.

Commit

- `feat(sp): switch single-player view by breakpoint`

—

## Phase 4 — Performance & Accessibility Polish ✅ (done)

Scope

- Added polite live-region feedback for the hand winner announcement on mobile to match desktop accessibility (`components/views/SinglePlayerMobile.tsx`).

Tests

- Regression covered by existing UI tests; no new code required.

Commit

- `chore(sp): improve mobile hand winner announcement`

—

## Phase 5 — Documentation & Release Readiness ✅ (done)

Scope

- Documented responsive behaviour and follow-ups in this plan and `DESKTOP_SINGLE_PLAYER.MD`.
- Highlighted hook reuse and responsive selection in project documentation to aid future contributors.

Tests

- Documentation only; no additional tests required.

Commit

- `docs(sp): finalize desktop single-player rollout`

—

## Ongoing Considerations

- Monitor bundle size; consider lazy-loading desktop-specific assets if needed.
- Track analytics post-launch to validate engagement assumptions.
- Revisit tablet breakpoint UX (touch vs. pointer) once telemetry is available.
