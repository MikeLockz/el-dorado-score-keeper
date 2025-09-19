# Implementing Staff Recommendations

This plan translates `@STAFF_RECOMMENDATIONS.md` into executable work, prioritized with the RICE framework and grouped into phases. Each phase ends with validation gates (`pnpm lint`, `pnpm format`, `pnpm test`, plus any phase-specific checks) and a commit before moving on.

## Prioritization Framework

We are using **RICE (Reach × Impact × Confidence ÷ Effort)** to balance maintainability, performance, and user value while respecting current architecture patterns.

- **Reach**: Estimated number of active sessions or developers affected in the next quarter (scale: 100, 250, 500, 1,000).
- **Impact**: Relative outcome uplift (3 = massive, 2 = high, 1 = medium, 0.5 = low).
- **Confidence**: Certainty in estimates (percent, capped at 100%).
- **Effort**: Rough engineer-weeks for completion (can be fractional).

RICE score = `(Reach × Impact × Confidence) ÷ Effort`. Higher scores land earlier phases.

### Initiative Scores

| Initiative                               | R   | I   | C    | E    | RICE  | Notes                                            |
| ---------------------------------------- | --- | --- | ---- | ---- | ----- | ------------------------------------------------ |
| Modular reducer + roster separation      | 500 | 2.5 | 0.65 | 2.5  | 325   | Unlocks clearer ownership, reduces regressions.  |
| Event catalog generation                 | 500 | 2   | 0.5  | 2    | 250   | Enables schema parity across app/worker.         |
| Single-player orchestration hook         | 250 | 2   | 0.6  | 1.5  | 200   | Stabilizes SP UI, reduces render churn.          |
| Batched seeding + migration              | 500 | 1.5 | 0.8  | 0.5  | 1,200 | Quick win preventing placeholder pollution.      |
| Snapshot instrumentation/tuning          | 500 | 1.5 | 0.6  | 1    | 450   | Keeps IndexedDB responsive on mid-tier hardware. |
| Memoized selectors                       | 250 | 1.5 | 0.8  | 0.5  | 600   | Immediate perf payoff for SP view.               |
| Score grid virtualization                | 250 | 1.5 | 0.6  | 1.5  | 150   | Needed once roster size increases.               |
| Responsive nav + modal confirmations     | 500 | 1.5 | 0.7  | 0.75 | 700   | Direct UX/accessibility upgrade.                 |
| Skeleton loading states                  | 500 | 1.2 | 0.7  | 0.6  | 700   | Increases perceived performance.                 |
| Color token audit                        | 500 | 1   | 0.7  | 0.6  | 583   | Improves accessibility compliance.               |
| Domain generators & ESLint boundary rule | 100 | 1.2 | 0.6  | 0.8  | 90    | Developer ergonomics.                            |
| Storybook adoption                       | 100 | 1   | 0.6  | 1.2  | 50    | Nice-to-have after architecture.                 |
| Debug docs                               | 100 | 0.8 | 0.9  | 0.3  | 240   | Quick documentation assist.                      |
| Playwright E2E suite                     | 500 | 2   | 0.6  | 2    | 300   | Coverage for end-to-end flows.                   |
| Reducer snapshot tests                   | 250 | 1.5 | 0.7  | 0.8  | 328   | Detect regressions during refactor.              |
| Worker contract tests                    | 250 | 1.5 | 0.7  | 0.5  | 525   | Keeps analytics pipeline safe.                   |
| Mutation testing pilot                   | 100 | 1   | 0.5  | 1    | 50    | Later quality investment.                        |
| CI typecheck/build jobs                  | 500 | 2   | 0.9  | 0.25 | 3,600 | Extremely high leverage safety net.              |
| pnpm cache sharing                       | 500 | 1   | 0.8  | 0.2  | 2,000 | Saves CI minutes.                                |
| Lighthouse preview gating                | 250 | 1.2 | 0.6  | 1.5  | 120   | Validate UX budgets post core work.              |
| Worker deploy changelog                  | 100 | 0.8 | 0.6  | 0.3  | 160   | Process improvement.                             |
| Guided onboarding flow                   | 250 | 1.5 | 0.5  | 1.5  | 125   | Depends on roster cleanup.                       |
| Session analytics & offline export       | 250 | 1.5 | 0.5  | 1.6  | 117   | Needs worker contract & catalog.                 |
| Accessibility audit                      | 500 | 1.8 | 0.7  | 0.7  | 900   | Run after UX updates.                            |

## Phase Breakdown

### Phase 1 – Stabilize State Architecture & Persistence (Weeks 1–4)

**Goals**: Harden event sourcing, eliminate noisy defaults, and ensure state operations follow best practices.

**Scope**

1. Refactor reducer into domain slices and extract roster operations service (`lib/state/types.ts`, `lib/roster`).
2. Introduce generated event catalog (`zod` or similar) powering both client validation and worker DTOs.
3. Convert single-player orchestration to `useSinglePlayerSession` hook; update `SinglePlayerMobile`/future desktop view.
4. Batch default player seeding, add migration script, and expose onboarding flag.
5. Instrument snapshot tuning, memoize heavy selectors.

**Deliverables**

- Refactored reducer modules with exhaustive unit coverage (existing suites updated).
- Codegen pipeline (`pnpm generate:events`) with integration tests verifying schema parity.
- New hook + component adjustments with Vitest/React Testing Library coverage.
- IndexedDB seed migration tested with property & integration tests.
- Performance instrumentation logs accessible via DevTools panel.

**Validation Checklist**

- `pnpm lint`
- `pnpm format`
- `pnpm test`
- `pnpm typecheck`
- Targeted performance benchmark (rehydrate + SP render) documented in PR.
- Commit: `feat(state): phase-1 stabilization`

### Phase 2 – UX & Accessibility Enhancements (Weeks 4–6)

**Goals**: Improve navigation ergonomics, loading feedback, and color accessibility while respecting existing Tailwind patterns.

**Scope**

1. Responsive header navigation with desktop inline menu and preserved dropdown on mobile.
2. Replace blocking browser dialogs with Radix AlertDialog flows for game actions.
3. Introduce skeleton states and optimistic mutations for games/scorecard lists.
4. Establish semantic color tokens in Tailwind config; refactor scorecard state badges and other muted UI elements.
5. Run full accessibility review (axe + manual keyboard sweep); fix announced labels, skip-link targets, live regions.

**Deliverables**

- Updated `components/header.tsx`, `app/games/page.tsx`, `components/views/CurrentGame.tsx` with responsive patterns.
- Shared skeleton components in `components/ui` with Storybook stories.
- Tailwind token map in `styles` with migration guide.
- Accessibility report added to `docs/accessibility/`.

**Validation Checklist**

- `pnpm lint`
- `pnpm format`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm storybook --smoke-test`
- axe CI (Playwright or storybook axe) passes.
- Commit: `feat(ux): phase-2 accessibility`

### Phase 3 – Tooling, Tests, and CI Resilience (Weeks 6–8)

**Goals**: Level up developer experience, expand automated coverage, and ensure pipelines gate regressions.

**Scope**

1. Add `pnpm typecheck` and `pnpm build` steps to CI; share pnpm cache across jobs.
2. Establish Playwright E2E suite (score round, single-player run, game archive/restore).
3. Create reducer snapshot fixtures + worker contract tests; integrate into Vitest.
4. Add generator scripts, import-boundary ESLint rule, and debug documentation.
5. Launch Storybook with initial stories for shared components (backfills Phase 2 skeleton coverage).

**Deliverables**

- Updated `.github/workflows/test.yml` plus cache strategy.
- `tests/e2e/*` Playwright runs with seeded fixtures and CI integration.
- Snapshot fixture directory with baseline JSON; contract tests for analytics payload.
- Generator CLI under `tools/` with unit tests; documentation in `docs/dev-experience.md`.
- Storybook config with minimum one story per shared component.

**Validation Checklist**

- `pnpm lint`
- `pnpm format`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm e2e` (headless Playwright)
- `pnpm storybook --smoke-test`
- Commit: `chore(tooling): phase-3 ci-and-tests`

### Phase 4 – Analytics, Product Insights, and Performance Budgets (Weeks 8–10)

**Goals**: Add data-driven features, ensure worker deploy safety, and gate performance regressions.

**Scope**

1. Introduce guided onboarding flow leveraging roster service (Phase 1 dependency).
2. Implement session analytics + offline export UX using the validated event catalog and worker contract tests.
3. Add worker deployment changelog and release checklist.
4. Integrate Lighthouse CI preview gating with agreed budgets.
5. Pilot mutation testing for single-player logic as ongoing quality experiment.

**Deliverables**

- Onboarding screens/components with behavioral tests.
- Analytics payloads dispatched through worker; dashboards/alerts configured.
- Export/import UI in settings with integration tests covering IndexedDB round-trip.
- `docs/releases/worker.md` + GitHub Action checklists.
- Lighthouse CI configuration and baseline stored under `configs/lighthouse/`.
- Mutation testing report with remediation guidance.

**Validation Checklist**

- `pnpm lint`
- `pnpm format`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm e2e`
- `pnpm lighthouse-ci`
- `pnpm mutation:test` (targeted modules)
- Commit: `feat(product): phase-4 analytics-and-budgets`

## Phase Transitions & Governance

- **Exit Criteria**: Each phase requires all validation checks green, documentation updated, and a code review sign-off from the Staff Engineer + product counterpart.
- **Rollback Plan**: Maintain feature flags or config toggles for user-facing changes (onboarding, analytics) to disable rapidly if regressions surface.
- **Knowledge Share**: Host a short tech talk after Phase 1 and 3 to acclimate the team to new architecture/tooling.

## Ongoing Maintenance

- Monitor snapshot timing metrics weekly; adjust heuristics when average apply time > 30 ms.
- Re-run accessibility audits every release cycle.
- Keep Storybook and generator templates updated as new UI/state patterns emerge.
- Review analytics worker changelog before each deploy to ensure environment parity.

## Appendix – Mapping Back to Recommendations

| Recommendation                                                                           | Phase              |
| ---------------------------------------------------------------------------------------- | ------------------ |
| Modular reducer, roster promotion                                                        | Phase 1            |
| Event catalog generation                                                                 | Phase 1            |
| Single-player session hook                                                               | Phase 1            |
| Batched seeding, snapshot tuning, memoized selectors                                     | Phase 1            |
| Score grid virtualization                                                                | Phase 2 (optional) |
| Responsive nav, modal confirmations, skeleton loading, color tokens, accessibility audit | Phase 2            |
| Domain generators, ESLint rule, Storybook, debug docs                                    | Phase 3            |
| Playwright E2E, reducer snapshots, worker contract tests, mutation pilot                 | Phase 3/4          |
| CI typecheck/build, pnpm cache                                                           | Phase 3            |
| Lighthouse CI gating                                                                     | Phase 4            |
| Guided onboarding, session analytics, offline export                                     | Phase 4            |
| Worker deployment safety                                                                 | Phase 4            |
