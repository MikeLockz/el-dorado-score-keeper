# Implement URL-Driven Views (Engineering Plan)

Audience: Senior engineers owning the navigation/persistence stack. The plan assumes familiarity with our Next.js app directory structure, state providers, and IndexedDB snapshot pipeline.

## Phase 1 – Provider & State Foundations

**Objectives**
- Extend `StateProvider` (and collaborators) to recognize both single-player and scorecard route contexts, passing `{ mode, gameId }` into the persistence layer.
- Introduce domain-specific “entity missing” components (`SinglePlayerGameMissing`, `ScorecardMissing`, `PlayerMissing`, `RosterMissing`, `ArchivedGameMissing`) with tailored messaging and CTAs.
- Harden selectors/helpers for entity lookups so detail routes can reliably detect missing IDs.

**Implementation Notes**
- Follow existing patterns in `components/state-provider.tsx` for deriving route context; keep parsing logic centralized to avoid drift.
- Components should live alongside their feature (e.g., `app/single-player/[gameId]/_components/`). Use small composable UI primitives to stay maintainable.
- Ensure missing-component CTAs use existing navigation helpers; avoid duplicating `router.push` strings.

**Tests & Validation**
- Add unit tests around route parsing (`components/state-provider.test.tsx`) and selector behaviour (e.g., `lib/state/selectors.spec.ts`).
- Snapshot/unit tests for each missing component verifying copy and CTA targets.
- Run `pnpm lint`, `pnpm vitest`, and targeted component tests. Confirm storybook/docs updated if applicable.
- Update relevant README/docs to explain missing-entity behaviour.
- Commit with message `feat(url-views): prepare provider and not-found scaffolding`.

## Phase 2 – Route Skeletons & New Game Flow

**Objectives**
- Create dynamic route trees:
  - `app/single-player/[gameId]` (with `layout.tsx`, `page.tsx`, `scorecard/page.tsx`, `summary/page.tsx`).
  - `app/single-player/new/(archive|continue)` implementing the confirmation flow using routed modals.
  - `app/scorecard/[scorecardId]` with live + summary pages.
- Replace `app/games/view` with `app/games/[gameId]` and intercepted modal routes (`@modal/restore`, `@modal/delete`).
- Flesh out roster/player archived route groups (`app/players/(filters)/archived`, `app/rosters/(filters)/archived`).

**Implementation Notes**
- Reuse shared layouts where possible (`app/single-player/[gameId]/layout.tsx` should wrap existing UI components, not duplicate logic).
- Keep components client/server boundaries consistent with current patterns to avoid hydration issues.
- New game flow should reuse `useNewGameRequest` internally; ensure `/single-player/new/archive` calls the same archival pathway.

**Tests & Validation**
- Playwright scenarios for navigating to each new route (including modals) with back/forward checks.
- Integration tests verifying `/single-player/new` branches based on progress state.
- Update `URL-VIEWS.md` and new implementation doc sections with any architectural decisions.
- Run full test suite plus `pnpm playwright test --config=playwright.smoke.config.ts`.
- Commit with message `feat(url-views): add routed skeletons and new-game flow`.

## Phase 3 – Navigation & UX Integration

**Objectives**
- Update global navigation, breadcrumbs, quick links, toasts, and share/export flows to use the new URLs.
- Implement accessible focus management for routed modals.
- Introduce centralized navigation helpers (e.g., `navigateToSpView`, `navigateToScorecardView`, `navigateToGameModal`) to reduce string literals.

**Implementation Notes**
- Ensure hover/active states prefetch appropriate segments; leverage `next/link` with `prefetch` where beneficial.
- Follow existing accessibility patterns (e.g., `components/dialogs` uses focus traps) when wiring modal routes.
- Maintain performance by deferring heavy data fetches to the layout where supported.

**Tests & Validation**
- UX regression passes with design (desktop/mobile) verifying navigation updates.
- Automated tests ensuring helpers generate expected paths.
- Lint, unit, and Playwright navigation smoke run.
- Documentation updates for nav helpers and modal behaviour.
- Commit with message `feat(url-views): align navigation with routed views`.

## Phase 4 – Instrumentation, SEO, and Lifecycle

**Objectives**
- Wire analytics for new routes (page views, modal confirmations) with ID payloads.
- Implement `generateMetadata` (or static metadata) for entity pages; set appropriate `robots` directives for modal routes.
- Document retention/expiry messaging in not-found components and ensure cache invalidation when archives change.

**Implementation Notes**
- Use existing observability helpers (e.g., `trackBrowserEvent`) to keep analytics consistent.
- Avoid extra network requests by deriving metadata from already-fetched data when possible.
- Coordinate with persistence owners to flush stale caches on delete/archive operations so routed pages reflect state immediately.

**Tests & Validation**
- Unit tests for analytics helpers (mocking event payloads).
- Metadata snapshot tests (e.g., verifying page titles include entity names).
- Manual validation clearing archives to confirm not-found messaging appears quickly.
- Update observability/SEO docs plus release notes draft.
- Commit with message `feat(url-views): add instrumentation and lifecycle handling`.

## Phase 5 – Final QA, Migration & Rollout

**Objectives**
- Enable feature flags/redirects for gradual rollout; decommission legacy `/single-player` rendering once confidence is high.
- Update support docs, onboarding flows, and in-app messaging to highlight new links.
- Ensure cross-tab sync (storage events/broadcast) closes modals when entities change elsewhere.

**Implementation Notes**
- Feature flag guard: wrap route exports or navigation entrypoints so toggle-off reverts to legacy behaviour without breaking builds.
- When sunsetting legacy paths, provide HTTP redirects (Next middleware or `redirect()` in route handlers) to preserve bookmarks.
- Monitor logs/metrics post-launch with alert thresholds for not-found occurrences.

**Tests & Validation**
- Full regression (unit + integration + Playwright) in CI with feature flag on.
- Manual QA across browsers/devices, including offline/storage quota scenarios.
- Verify documentation/support links updated and release notes prepared.
- Commit with message `feat(url-views): finalize rollout and remove legacy paths`.

---

### Ongoing Maintenance
- Keep `URL-VIEWS.md` and this implementation guide updated as routes evolve.
- Enforce test coverage for any new route-dependent feature.
- Periodically audit analytics dashboards to ensure new segments/IDs remain accurate.
