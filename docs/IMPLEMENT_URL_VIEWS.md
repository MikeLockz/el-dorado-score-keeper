# Implement URL-Driven Views (Engineering Plan)

Audience: Senior engineers owning the navigation/persistence stack. The plan assumes familiarity with our Next.js app directory structure, state providers, and IndexedDB snapshot pipeline.

## Phase 1 – Provider & State Foundations

**Status (2025-10-05):** Route context plumbing, persistence updates, missing entity surfaces, and selector/util hardening are implemented. Remaining follow-ups: migrate legacy feature consumers onto the new ID-based selectors and add Storybook coverage for the missing-entity components (queued for Phase 3).

**Objectives**
- [x] Extend `StateProvider` (and collaborators) to recognize both single-player and scorecard route contexts, passing `{ mode, gameId }` into the persistence layer.
- [x] Introduce domain-specific “entity missing” components (`SinglePlayerGameMissing`, `ScorecardMissing`, `PlayerMissing`, `RosterMissing`, `ArchivedGameMissing`) with tailored messaging and CTAs.
- [x] Harden selectors/helpers for entity lookups so detail routes can reliably detect missing IDs.

**Implementation Notes**
- [x] Follow existing patterns in `components/state-provider.tsx` for deriving route context; keep parsing logic centralized to avoid drift.
- [x] Components live alongside their feature (e.g., `app/single-player/[gameId]/_components/`) and stay small/composable.
- [x] Missing-component CTAs rely on Next.js `Link` + shared metadata helpers to avoid ad-hoc `router.push` strings.

### Workstream 1 – Route Context Derivation & Persistence Wiring
- [x] Added `deriveRouteContext(pathname)` beside the provider to resolve `{ mode, gameId, scorecardId }` with validation for `/single-player/{gameId}` (incl. `/scorecard` + `/summary` descendants) and `/scorecard/{scorecardId}` while ignoring legacy entry points.
- [x] Updated `StateProvider` to memoize the derived context, seed `createInstance` with `{ mode: 'single-player', spGameId }`, and call `instance.rehydrate({ routeContext, allowLocalFallback: true })` on context transitions; scorecard hydration is deferred but the ID is threaded through context for later phases.
- [x] Exposed the context via `useAppState()` for downstream layouts/pages.
- [x] Extended `createInstance` to accept the generalized route context, appending TODO markers for non-single-player hydration.
- [x] Snapshot/persistence failures now emit typed warnings (`single-player.snapshot.unavailable`, etc.) surfaced through provider state.

### Workstream 2 – Missing Entity Surfaces
- [x] Centralized copy/CTA metadata in `lib/ui/not-found-metadata.ts`.
- [x] Implemented `SinglePlayerGameMissing`, `ScorecardMissing`, `PlayerMissing`, `RosterMissing`, and `ArchivedGameMissing` as feature-local client components built on a shared `<EntityMissingCard>`.
- [x] Storybook/MDX coverage landed in Phase 3 (`components/missing/EntityMissingCard.stories.tsx`, `docs/architecture/navigation-helpers.mdx`).

### Workstream 3 – Selector & Helper Hardening
- [x] Added ID-based selectors (`selectSinglePlayerGame`, `selectScorecardById`, `selectPlayerById`, `selectRosterById`) alongside existing helpers.
- [ ] Migrate legacy consumers away from implicit `state.sp`/`state.players` accessors; will tackle alongside routed page adoption in Phase 2.
- [x] Introduced `assertEntityAvailable` in `lib/state/utils.ts` plus unit coverage to standardise availability checks.

### Observability & Dev Ergonomics
- [x] Surface `useAppState().context` and snapshot warnings in the dev debug globals (`__APP_ROUTE_CONTEXT__`, `__APP_WARNINGS__`).
- [x] Authored `docs/architecture/navigation.md` documenting the Phase 1 routing foundations.

**Tests & Validation**
- [x] Added unit coverage for route parsing (`tests/unit/components/state-provider.test.tsx`) and entity selectors (`tests/unit/selectors-entity-lookup.test.ts`).
- [x] Added component tests validating missing-entity copy/CTAs (`tests/unit/components/missing-entities.test.tsx`).
- [x] `pnpm lint` (2024-04-06).
- [!] `pnpm vitest` – suite reports two order-dependent failures (`tests/unit/client-log.node.test.ts`, `tests/unit/sp-engine-seeded-deal.test.ts`), both pass when re-run individually; needs follow-up flake fix.
- [x] `docs/architecture/navigation.md` updated with new context/missing-entity guidance.
- [x] README call-outs for missing-entity behaviour (added deep-link + missing-entity guidance on 2025-10-05).
- Commit message TBD for final Phase 1 merge (`feat(url-views): prepare provider and not-found scaffolding`).

## Phase 2 – Route Skeletons & New Game Flow

**Status (2025-10-05):** Core dynamic routes, routed modals, and entity guards are live. Navigation/link helpers now resolve dynamic IDs, not-found CTAs point at the new flows, and Phase 2 validation coverage has landed; remaining work focuses on migration of legacy state consumers and release prep.

**Objectives**
- [x] Create dynamic route trees:
  - `app/single-player/[gameId]` with dedicated sub-pages for live play, scorecard, and summary views plus entity-aware `layout.tsx`/`not-found.tsx` guards.
  - `app/single-player/new/(archive|continue)` implementing the confirmation flow via routed modals bound to `useNewGameRequest`.
  - `app/scorecard/[scorecardId]` exposing live editing and summary exports with a shared layout.
- [x] Replace `app/games/view` with `app/games/[gameId]` and intercepted modal routes (`@modal/restore`, `@modal/delete`).
- [x] Flesh out roster/player archived route groups (`app/players/(filters)/archived`, `app/rosters/(filters)/archived`) and introduce entity detail routes keyed by ID.

### Workstream 1 – Single Player Route Tree & Layouts
- [x] Add `app/single-player/layout.tsx` to resolve the active `gameId` (latest or setup fallback) and redirect legacy `/single-player` traffic accordingly.
- [x] Create `app/single-player/[gameId]/layout.tsx` that validates context, hydrates state, and renders shared chrome (tabs, headers, CTA strip).
- [x] Implement child pages:
  - `page.tsx` → live play experience (current `SinglePlayerApp`).
  - `scorecard/page.tsx` → read-only scoreboard surface backed by store selectors.
  - `summary/page.tsx` → post-round analytics summary.
- [x] Introduce loading/error boundaries (`loading.tsx`, `not-found.tsx`) wired to the Phase 1 missing-entity components.
- [x] Ensure tab toggles dispatch `router.push` events so in-app navigation syncs with browser history.

### Workstream 2 – New Game Flow & Routed Confirmation Modals
- [x] Scaffold `app/single-player/new/page.tsx` to fetch progress state and branch between auto-create and confirmation modal segments.
- [x] Add `app/single-player/new/@modal/(archive|continue)/page.tsx` (or equivalent `(confirm)/` group) to host the archive/continue confirmation flows.
- [x] Reuse `useNewGameRequest` for archival + creation logic; centralize side effects (analytics, toasts) in a shared helper to avoid duplication.
- [x] Redirect archive confirmation back to the new game’s `/single-player/{gameId}` URL; redirect continue to the existing game.
- [x] Provide optimistic UI + error handling for persistence failures (snapshot errors bubble into modal state).

- [x] Introduce `app/scorecard/layout.tsx` that redirects `/scorecard` to the latest/active session ID or setup wizard.
- [x] Build `app/scorecard/[scorecardId]/layout.tsx` to hydrate scorecard state via Phase 1 selectors.
- [x] Implement `page.tsx` (interactive score entry) and `summary/page.tsx` (export/print view) under `[scorecardId]`.
- [x] Thread the missing-entity surfaces and analytics hooks so cold deep links render helpful CTAs.
- [x] Audit state dependencies to ensure scorecard views stay read/write as intended while summary remains read-only.

- [x] Replace `app/games/view` with `app/games/[gameId]/page.tsx` plus `not-found.tsx` using `ArchivedGameMissing`.
- [x] Add intercepted modal routes (`app/games/[gameId]/@modal/restore`, `/delete`) to host confirmation flows with proper focus traps.
- [x] Create routed archive list pages: `app/players/(filters)/archived/page.tsx` and `app/rosters/(filters)/archived/page.tsx`, reusing existing filter components.
- [x] Add entity detail routes (`app/players/[playerId]/page.tsx`, `app/rosters/[rosterId]/page.tsx`) with layouts that hydrate context, guard missing IDs, and prefetch adjacent data for navigation.
- [x] Update navigation links and quick actions to reference the new routes (Quick Links, header nav, restore flows, and `deriveGameRoute` all emit ID-based URLs; modal fallbacks now consult `resolveSinglePlayerRoute`).

**Implementation Notes**
- Favor server components for layouts/pages that only read route params; wrap client-only presenters (e.g., `SinglePlayerApp`) behind `'use client'` entry points to avoid hydration churn.
- Centralize route-to-context parsing in the Phase 1 helpers to ensure modals/detail pages hydrate identical state slices.
- Share design tokens and shell components across live/scorecard/summary views to keep responsive breakpoints consistent.
- Leverage Next.js intercepted routes for modals: the page renders in `@modal` while background content stays at the parent route.
- Gate archive/restore flows behind feature flags until QA finishes; add TODO markers where downstream consumers still expect legacy URLs.

**Tests & Validation**
- [x] Add integration tests ensuring `/single-player/new` branches correctly based on in-progress state and archival outcomes (`tests/ui/sp-new-page-ui.test.tsx`).
- [x] Backfill unit tests for new layouts/helpers (e.g., route guards, redirect logic) and missing-entity fallbacks (`tests/ui/sp-root-layout.test.tsx`, `tests/ui/sp-game-layout.test.tsx`).
- [x] Update `URL-VIEWS.md` and this implementation doc with architectural decisions as they land; call out feature-flag toggles for rollout (docs refreshed 2025-10-05).
- [ ] Run `pnpm vitest` prior to merge; investigate and track any flaky cases. (2025-10-05 run surfaced existing failures in `tests/unit/components/games-modals.test.tsx` and `tests/unit/components/scorecard-summary.test.tsx`; needs follow-up outside this change.)
- [x] Run `pnpm lint` (2024-04-06).
- [ ] Commit with message `feat(url-views): add routed skeletons and new-game flow` once all workstreams land.

## Phase 3 – Navigation & UX Integration

**Status (2025-10-12):** Navigation helpers, share/export affordances, and routed modal accessibility are implemented. Follow-up work focuses on polishing analytics (Phase 4) and rollout tasks.

**Objectives**
- [ ] Replace legacy URL usage across global navigation, quick links, list actions, and toast/share flows with helper-generated deep links.
- [ ] Ensure “Share”, “Copy link”, and export actions capture the active entity context (`gameId`, `scorecardId`, `playerId`, `rosterId`).
- [ ] Deliver consistent focus management and announcements for routed modals so keyboard/screen-reader users can navigate archive/restore flows.
- [ ] Consolidate navigation utilities (`resolveSinglePlayerRoute`, `resolveScorecardRoute`, `deriveGameRoute`, plus new player/roster helpers) and migrate call sites away from string literals.
- [x] Add Storybook + MDX coverage for entity-missing cards and navigation helpers, closing the Phase 1 TODO.
- [ ] Document modal accessibility patterns and helper usage for contributors.

### Workstream 1 – Navigation Surface Alignment
- [x] Update `components/header.tsx`, `components/landing/HeroCtas.tsx`, `components/landing/QuickLinks.tsx`, and `app/games/page.tsx` to pull URLs exclusively from the helper set with fallback handling for missing IDs.
- [x] Refactor list/detail affordances under `app/single-player`, `app/players`, `app/rosters`, and `app/games` so empty states, quick actions, and table menus generate routes through helpers (`resolveSinglePlayerRoute`, `resolveScorecardRoute`, `deriveGameRoute`).
- [x] Revise toast/notification builders in `components/ui` and scorecard summary exports so “Copy link”/share buttons emit helper-driven URLs and surface success/error messaging.
- [x] Audit onboarding tooltips, Quick Links, and landing CTA copy to ensure deep links reference the routed views and update analytics metadata accordingly.

### Workstream 2 – Routed Modal Accessibility & Focus Management
- [x] Introduce a reusable focus manager (`components/dialogs/RoutedModalFocusManager.tsx`) that captures the trigger element, sets initial focus inside `@modal` routes, and restores focus on close/navigation.
- [x] Instrument routed modal segments (`app/games/[gameId]/@modal/(restore|delete)`, `app/single-player/new/@modal/(archive|continue)`) to use the focus manager, provide `aria-labelledby`/`aria-describedby`, and announce context changes via `aria-live` where appropriate.
- [x] Ensure Escape/backdrop handlers coordinate with `router.back()` so exiting a modal returns users to the prior focus target without history glitches.

### Workstream 3 – Navigation Helper Consolidation & Deprecation
- [x] Expand the helper module (`lib/state/utils.ts`) with `resolvePlayerRoute`, `resolveRosterRoute`, `resolveArchivedFilterRoute`, and `resolveGameModalRoute` utilities plus TypeScript types describing supported views/modals.
- [x] Provide migration shims by centralising route generation and updating legacy call sites; no additional lint rule required post-refactor.
- [x] Update server-facing link builders (`lib/state/io.ts`, email/export payload generators) to reuse the helpers so URLs stay consistent across SSR and client contexts.

### Workstream 4 – Storybook & UX Enablement
- [x] Add Storybook stories/MDX docs for `SinglePlayerGameMissing`, `ScorecardMissing`, `PlayerMissing`, `RosterMissing`, and `ArchivedGameMissing`, including knobs for archived/missing states and CTA previews.
- [x] Capture navigation helper usage examples in documentation (`docs/architecture/navigation-helpers.mdx`), demonstrating typical flows (live → scorecard → summary, share/export, modal restore).
- [ ] Schedule design/UX review sessions (desktop + mobile) to confirm updated navigation and modal behaviour before Phase 4 instrumentation.

**Implementation Notes**
- Prefer `next/link` with `prefetch` on hoverable elements (header nav, quick links) while avoiding eager prefetch on destructive modal routes.
- Keep helper logic pure/synchronous so it can be reused from server components and export utilities without async overhead.
- Route-level loaders should remain the source of truth for entity availability; UI surfaces simply consume the helper output and respond to missing IDs with the existing not-found components.
- Coordinate with persistence owners on copy updates for share/export flows so messaging reflects IndexedDB retention constraints.

**Tests & Validation**
- [ ] Backfill unit tests for new helpers in `tests/unit/state/utils.test.ts` and add coverage for player/roster/game modal paths.
- [ ] Extend Playwright navigation suites to exercise header links, Quick Links, and share/toast flows across desktop/mobile viewports, verifying history/back behaviour.
- [ ] Add accessibility smoke tests (`@axe-core/playwright` or existing helpers) for routed modals to confirm focus trapping, announcements, and Escape key handling.
- [ ] Update component tests for missing-entity cards to include Storybook snapshot assertions where practical.
- [x] Run `pnpm lint` and targeted Vitest coverage (`pnpm vitest run tests/unit/state/utils.test.ts`) pre-submit; plan a full run prior to merge and track flakes noted in earlier phases.
- [ ] Commit with message `feat(url-views): align navigation with routed views` once objectives reach ✅.

## Phase 4 – Instrumentation, SEO, and Lifecycle

**Objectives**
- [x] Wire analytics for new routes (page views, modal confirmations) with ID payloads.
- [x] Implement `generateMetadata` (or static metadata) for entity pages; set appropriate `robots` directives for modal routes.
- [x] Document retention/expiry messaging in not-found components and ensure cache invalidation when archives change.

**Implementation Notes**
- Added typed view helpers (`trackSinglePlayerView`, `trackScorecardView`, `trackPlayerDetailView`, etc.) in `lib/observability/events.ts`. Layouts and detail pages emit a single analytics event per view transition.
- `generateMetadata` now ships with every entity route (`/single-player/{id}`, `/scorecard/{id}`, `/players/{id}`, `/rosters/{id}`, `/games/{id}`) and mirrors the identifiers into Open Graph/Twitter attributes. Modal route layouts set `robots: { index: false, follow: false }`.
- Retention copy references the 8-game/30-day single-player snapshot window via `lib/ui/not-found-metadata.ts`.
- Introduced `lib/state/game-signals.ts` with `emitGamesSignal`/`subscribeToGamesSignal`. Archive/reset/delete flows broadcast invalidation to list/detail views (handled in `app/games/page.tsx` and `app/games/[gameId]/GameDetailPageClient.tsx`).

**Tests & Validation**
- [x] Unit tests for analytics helpers (mocking event payloads).
- [x] Metadata snapshot tests (e.g., verifying page titles include entity names).
- [ ] Manual validation clearing archives to confirm not-found messaging appears quickly.
- [x] Update observability/SEO docs plus release notes draft.
- [ ] Commit with message `feat(url-views): add instrumentation and lifecycle handling`.

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
- Full regression (unit + integration) in CI with feature flag on.
- Manual QA across browsers/devices, including offline/storage quota scenarios.
- Verify documentation/support links updated and release notes prepared.
- Commit with message `feat(url-views): finalize rollout and remove legacy paths`.

---

### Ongoing Maintenance
- Keep `URL-VIEWS.md` and this implementation guide updated as routes evolve.
- Enforce test coverage for any new route-dependent feature.
- Periodically audit analytics dashboards to ensure new segments/IDs remain accurate.
