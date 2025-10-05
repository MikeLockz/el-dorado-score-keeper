**Overview**

- Build URL-addressable views for Single Player so scorecard, live play, and summaries can be deep linked, shared, and navigated with back/forward controls.
- Restructure the `app/single-player` route into a dynamic game-scoped tree that maps to `/single-player/{gameId}`, `/single-player/{gameId}/scorecard`, and `/single-player/{gameId}/summary`.
- Preserve existing gameplay state (engine, roster management, analytics) while making navigation a first-class URL concern.
- Leverage the merged single-player snapshot persistence (`lib/state/persistence/sp-snapshot.ts`) so every route bootstraps the correct `gameId` from IndexedDB (with `localStorage` fallback) via the existing `StateProvider`.
- Expand Score Card mode into ID-addressable sessions that mirror the single-player URL contract, enabling `/scorecard/{scorecardId}` deep links with optional sub-views.
- Introduce stable, shareable URLs for roster and player management so `/rosters/{rosterId}` and `/players/{playerId}` open the correct record directly.
- Formalize additional management surfaces (archived games, archived players/rosters) into routes so sharing, QA reproduction, and modal flows rely on URLs instead of local component state.

**Current Behavior**

- `app/single-player/page.tsx` owns all Single Player UI states and keeps everything behind a single URL (`/single-player`).
- Game identity is implicit in the in-memory/app-db state; the URL does not change when switching between live play, scorecard, or summary UIs.
- Internal navigation uses local component state, so browser history, deep linking, and sharing are not possible.
- Score Card mode lives at `/scorecard`; it multiplexes "current game" and historical summary panels in-page with no concept of a `scorecardId` in the URL.
- Player and roster management pages (`/players`, `/rosters`) rely on in-page state (dialogs, accordions) to focus a specific record; no direct-link surface exists today.
- Archived game details live on `/games/view` with a `?id=` query parameter; restore/delete confirmations are handled by local menus instead of navigable routes.
- Archived players and rosters are hidden behind stateful toggles inside `PlayerManagement`, so reloading the page loses that context.

**Target Experience**

- Landing on `/single-player/{gameId}` loads the current live play experience (desktop/mobile variants) seeded by `gameId`.
- `/single-player/{gameId}/scorecard` shows the scorecard view in read-only mode backed by the same state slice.
- `/single-player/{gameId}/summary` renders the post-round/game summary with the correct analytics payload.
- Moving between in-app tabs updates the route (using `router.push/replace`) and browser history reflects those transitions.
- Visiting a deep link cold-starts the state provider, rehydrates the specified `gameId`, and displays the correct view without intermediate flicker.
- `/scorecard/{scorecardId}` restores the named Score Card session (roster, scores, history) with parity to the existing global experience; optional `/scorecard/{scorecardId}/summary` (or `/export`) routes expose dedicated print/share views.
- `/players/{playerId}` and `/rosters/{rosterId}` resolve the referenced entity, open the relevant management UI in detail mode, and support forward/back navigation without resetting other list state.
- `/games/{gameId}` loads archived analytics with restore/delete flows surfaced as routed modals (e.g., `/games/{gameId}/restore`), and `/players/archived` / `/rosters/archived` land directly on archived lists without manual toggles.

**URL Map**

- `/` → landing page with mode cards, hero copy, and quick links.
- `/single-player` → entry point that redirects to the most recent single-player game or shows setup when none exist.
- `/single-player/new` → single-player new-game flow; presents confirmation if progress exists.
- `/single-player/new/archive` → archives the current single-player session and starts a fresh run, then redirects to the new game URL.
- `/single-player/new/continue` → exits the new-game flow and returns to the active single-player session without changes.
- `/single-player/[gameId]` → live single-player experience (desktop/mobile variants) for the specified game.
- `/single-player/[gameId]/scorecard` → read-only scorecard lens for the same single-player game.
- `/single-player/[gameId]/summary` → post-game summary and analytics for the single-player run.
- `/scorecard` → legacy Score Card entry that redirects to the newest scorecard session or the setup flow.
- `/scorecard/[scorecardId]` → active Score Card tracking UI where scores can be edited.
- `/scorecard/[scorecardId]/summary` → printable/exportable recap for the Score Card session.
- `/players` → player management hub showing active players.
- `/players/archived` → archived player list for restore-only operations.
- `/players/[playerId]` → player detail/editor screen.
- `/rosters` → roster management hub for saved lineups.
- `/rosters/archived` → archived roster list view.
- `/rosters/[rosterId]` → roster detail/editor with load actions for game modes.
- `/games` → archived games table with restore/delete actions.
- `/games/[gameId]` → archived game detail and analytics view.
- `/games/[gameId]/restore` → confirmation modal route to restore the archived game as the active session.
- `/games/[gameId]/delete` → confirmation modal route to permanently delete the archived game.
- `/rules` → static rules/how-to-play content.
- `/settings` → settings page for theme selection and analytics opt-out.
- All entity-scoped routes (single-player games, scorecards, players, rosters, archived game detail) must render a friendly "not found" message in place when the referenced ID is missing, offering CTAs to start a new entity or navigate to the appropriate archive/list view instead of hard-redirecting.

**Routing Architecture Plan**

- Introduce `app/single-player/[gameId]/layout.tsx` as a shared boundary that:
  - Resolves `gameId`, verifies it exists in state, and redirects to setup if invalid.
  - Provides shared UI chrome (header, navigation tabs) and passes down the loaded context.
  - Bridges the client state provider with RSC by leveraging a client-side wrapper (`SinglePlayerGameShell`).
  - Mounts the existing `StateProvider` at this boundary so the client instance is created with `spGameId` (the layout can stay server-side; the provider is already `use client`).
  - Optionally prefetches game metadata (e.g., title, savedAt) via a lightweight loader that consults the IndexedDB game index when rendering server components.
- Split view components into route-specific pages:
  - `app/single-player/[gameId]/page.tsx` → live play (reuse `SinglePlayerDesktop/Mobile`).
  - `app/single-player/[gameId]/scorecard/page.tsx` → extract current scorecard panel into its own client component.
  - `app/single-player/[gameId]/summary/page.tsx` → extract summary view component.
- Use a route group if we need to preserve the existing `/single-player/page.tsx` for backwards compatibility during rollout: e.g. `app/single-player/(legacy)/page.tsx` with a temporary redirect/thin wrapper.
- Create a sibling dynamic tree for Score Card: `app/scorecard/[scorecardId]/layout.tsx` loads the requested session, guards against missing data (redirects to setup), and composes score-specific nav (tabs for "Live" vs "Summary").
- Generalize the client provider bootstrap so both `/single-player/{gameId}` and `/scorecard/{scorecardId}` can pass their identifiers (e.g., rename `extractSinglePlayerGameId` to `extractGameContextFromPath`). The layout should request rehydrate with `{ mode: 'scorecard', id }` when applicable.
- Add `app/players/[playerId]/page.tsx` and `app/rosters/[rosterId]/page.tsx` as thin server entries that load the entity and render a shared client detail shell with the existing management components mounted in focused mode.
- Replace `app/games/view/page.tsx` with `app/games/[gameId]/page.tsx` plus intercepted modal routes (`app/games/[gameId]/@modal/(restore|delete)/page.tsx`) so confirmation flows and deep links share a consistent URL contract.
- Promote archived management toggles into route groups such as `app/players/(filters)/archived/page.tsx` and `app/rosters/(filters)/archived/page.tsx`, mounting the existing lists under layout primitives that drive state from the segment instead of local booleans.
- Introduce a `single-player/new` route group with nested `archive` and `continue` segments so the “new game” confirmation dialog becomes URL driven.
- Stand up `app/games/[gameId]/page.tsx` to replace `/games/view?id=` and co-locate intercepted routes (`@modal/restore`, `@modal/delete`) so the list can push URL-driven modals instead of managing popovers locally.
- Consider `app/players/(filters)/archived/page.tsx` and `app/rosters/(filters)/archived/page.tsx` route groups (or query-based segments) to formalize archived views and remove stateful toggles.

**State & Data Management**

- Single player sessions already persist a stable `gameId` and snapshot via `createInstance` → `persistSpSnapshot`; reuse that `state.sp.currentGameId` and the `sp/game-index` lookup written to IndexedDB.
- The client `StateProvider` (see `components/state-provider.tsx`) now derives `spGameId` from the URL and calls `instance.rehydrate({ spGameId })`, which in turn invokes `rehydrateSinglePlayerFromSnapshot` (IndexedDB preferred, `localStorage` fallback). Ensure new routes keep this provider in the tree.
- Use the rehydrated snapshot to seed all gameplay data, roster metadata, trick history, scoring, and analytics flags. Handle `rehydrateSinglePlayerFromSnapshot` failure cases by redirecting to setup or showing an inline error.
- Engine entry points (`useSinglePlayerEngine`, `events.spDeal`, analytics hooks) should continue to accept `gameId`; verify any new route-aware utilities pass the `gameId` from layout context rather than reading implicit globals.
- Maintain compatibility with the "Quick Start" flow by generating a new `gameId`, persisting it through the snapshot helper, and routing immediately to `/single-player/{newId}` so a reload hits the indexed snapshot.
- Mirror the lookup strategy for Score Card sessions: persist a lightweight `scorecardId` index (or reuse the existing games archive API via `lib/state/io.ts`) so `/scorecard/{scorecardId}` can rehydrate without relying on in-memory context.
- Update `StateProvider` (or a sibling provider) to accept `{ mode, gameId }` tuples, allowing scorecard deep links to bootstrap either from the event log archive (`restoreGame`) or a future scorecard snapshot mirror.
- Provide selectors/utilities (`selectRosterById`, `selectPlayerById`) that guard missing records and surface consistent 404 handling for `/players/{playerId}` and `/rosters/{rosterId}` routes.
- For games, introduce a shared `GameRecordProvider` that preloads data in `app/games/[gameId]/page.tsx` and lets restore/delete CTA handlers push to `/games/{id}/restore` or `/games/{id}/delete` so modal routes hydrate autonomously.
- Expose list filters via selectors that respect archived segments so `/players/archived` and `/rosters/archived` stay in sync with the state tree without bespoke toggles.
- Add state helpers that determine whether a single-player confirmation is needed (e.g., `hasSinglePlayerProgress`) so `/single-player/new` can synchronously decide to prompt or create.
- Standardize entity lookup guards so `/single-player/{gameId}`, `/scorecard/{scorecardId}`, `/players/{playerId}`, `/rosters/{rosterId}`, and `/games/{gameId}` render an inline "entity not found" state with primary/secondary links (e.g., create new, view archive) rather than redirecting away.

**Navigation & URL Sync**

- Replace local view switches with Next.js navigation primitives:
  - Use `<Link>` for tab-like UI (scorecard/summary) and `router.replace` for programmatic transitions (end-of-round auto-navigation, save flows).
  - Centralize navigation helpers (`navigateToSpView(gameId, view)`) to avoid duplicated string paths.
- When the engine triggers phase changes (e.g., round completed → summary), call `router.push(`/single-player/${gameId}/summary`)` so history reflects the transition.
- Ensure analytics/state cleanup hooks do not assume a single URL; update to read the active segment via `useSelectedLayoutSegment` when needed.
- Apply the same navigation helpers for Score Card (`navigateToScorecardView(scorecardId, view)`) so both modes stay consistent and analytics capture `scorecardId`.
- Player and roster detail pages should encode tab/sub-section state via search params (e.g., `?tab=history`) rather than internal component state so back/forward works as expected.
- New game CTAs should push to `/single-player/new` (or scorecard equivalent) instead of invoking the provider directly; the modal component listens for the nested segment to decide which controls to show.
- Archived player/roster toggles should call `router.push('/players/archived')` / `/rosters/archived` (or update `view` search params) so URL + history drive which list is visible.

**Implementation Plan**

1. **Discovery & Abstractions**
   - Audit `lib/state` and `useSinglePlayerEngine` for implicit globals; document required state additions (`gameId`, per-game metadata, routing hints).
   - Identify reusable view components that can be moved into dedicated routes without duplicating logic.
   - Confirm `StateProvider` is mounted for all new single-player routes and that `extractSinglePlayerGameId` covers any planned URL variants (update the helper if query params or alternative segment orders are required).
   - Evaluate Score Card persistence requirements: decide between leveraging the games archive (`lib/state/io.ts`) or adding a dedicated snapshot mirror to guarantee `/scorecard/{scorecardId}` resilience.
   - Map player and roster detail UI requirements to existing components; note any stateful dialogs that need to become route-driven.
2. **Routing Skeleton**
   - Create the dynamic route directory (`app/single-player/[gameId]`) with placeholder components and a shared layout that renders child slots.
   - Add a migration-friendly redirect in the old `/single-player/page.tsx` to the new structure (e.g., `router.replace` with the active/most recent `gameId`).
   - Stand up `app/scorecard/[scorecardId]` with parallel layout/pages (live, summary/export) and a temporary redirect from `/scorecard`.
   - Add `/players/[playerId]` and `/rosters/[rosterId]` pages that render progressive enhancement-friendly skeletons while the client bundle hydrates.
   - Replace `app/games/view` with `app/games/[gameId]` and introduce intercepted modal routes for restore/delete confirmations.
   - Split archived player/roster lists into route groups (`app/players/(filters)/archived`, `app/rosters/(filters)/archived`) or query-param wrappers so the shell responds to URL state.
3. **State Wiring**
   - Plug the layout shell into `StateProvider` so client boot passes `spGameId`; no additional persistence hooks are needed because `createInstance` already mirrors snapshots to IndexedDB and `localStorage`.
   - When rendering server components that need game metadata (e.g., page titles), read from the IndexedDB index via `lib/state/persistence/sp-snapshot.loadSnapshotByGameId` using the `sp/game-index` entry provided by the persistence layer.
   - Update providers, selectors, and engine hooks to consume `gameId` passed via layout context or route params rather than assuming a singleton session.
   - Extend provider bootstrap to detect Score Card routes, derive `{ mode: 'scorecard', id }`, and hydrate via archive lookup or upcoming snapshot helper; ensure analytics emit `scorecardId`.
   - Expose `PlayerDetailProvider`/`RosterDetailProvider` contexts fed by selectors so client components can rely on memoized derived data when rendered from `/players/{playerId}` or `/rosters/{rosterId}`.
   - Add a `GameRecordProvider` consumed by `/games/[gameId]` and its modal routes so restore/delete confirmations reuse cached data.
   - Wire archived view selectors to accept a `view` parameter derived from the route so `/players/archived` and `/rosters/archived` hydrate the correct list on load.
   - Extend `useNewGameRequest` (or a new facade) so `/single-player/new/archive` can execute the archival flow, while `/single-player/new/continue` simply navigates back to the active game.
4. **View Extraction**
   - Move live play UI into `page.tsx` under `[gameId]` (minimal refactor).
   - Extract scorecard and summary views into dedicated client components consumed by their respective pages.
- Add shared navigation UI in the layout (tabs/buttons) to switch between views, wired to the router.
- Factor Score Card UI into modular components that can render inside both the list landing (`/scorecard`) and dynamic detail routes without duplication.
- Promote existing player/roster modals to standalone detail components that can render inline when navigated directly.
- Recompose the games table contextual menu into reusable modal content rendered by `/games/[gameId]/@modal/(restore|delete)`.
- Extract archived player/roster list components so they can mount under dedicated archived routes without depending on toggled JSX.
- Build a `SinglePlayerNewGameShell` route (`app/single-player/new/(...)`) that hosts the confirmation modal; `/archive` triggers the archival mutation, `/continue` aborts, and the base path redirects based on existing progress.
- For each entity type, add a domain-specific "not found" component (e.g., `SinglePlayerGameMissing`, `ScorecardMissing`, `PlayerMissing`, `RosterMissing`, `ArchivedGameMissing`) that renders tailored copy and CTAs to start/create or browse relevant archives; detail routes render the matching component when lookups fail.
  - `SinglePlayerGameMissing` → headline “Game not found”, explanatory text that the requested single-player run can’t be located, primary CTA to `/single-player/new`, secondary CTA to `/games` to browse archives.
  - `ScorecardMissing` → headline “Score Card not found”, explains the session may have been archived/removed, primary CTA to `/scorecard` to start a new card, secondary CTA to `/games` for archived sessions.
  - `PlayerMissing` → headline “Player not found”, notes the profile might be archived/deleted, primary CTA to `/players` to add a player, secondary CTA to `/players/archived` to browse archived profiles.
  - `RosterMissing` → headline “Roster not found”, explains the lineup couldn’t be located, primary CTA to `/rosters` to create one, secondary CTA to `/rosters/archived` to view archived rosters.
  - `ArchivedGameMissing` → headline “Game archive not found”, notes the archive entry may have been deleted, primary CTA back to `/games`, secondary CTA to `/single-player/new` for a fresh run.
5. **Polish & Cleanup**
   - Update deep link entry points (e.g., Quick Links, game lists) to point at the new URLs.
   - Remove unused legacy logic and ensure url-based navigation updates analytics, toasts, and breadcrumbs correctly.
   - Document the new routing contract for other contributors.
   - Ensure "Share"/"Export" affordances in Score Card copy the new `/scorecard/{scorecardId}` URLs.
   - Update onboarding tooltips, docs, and support links to use `/players/{playerId}` and `/rosters/{rosterId}` patterns where relevant.
   - Point Quick Links and games table actions at `/games/{gameId}` and the modal routes so restore flows no longer depend on client-only popovers.
   - Refresh help/support documentation with `/players/archived` and `/rosters/archived` URLs for archived roster/player workflows.

**Additional Considerations**

- **Instrumentation**
  - Ensure page-view and modal analytics emit route identifiers (`gameId`, `scorecardId`, `playerId`, `rosterId`) so dashboards remain accurate after URL changes.
  - Update telemetry schemas/dashboards to recognize new routes such as `/single-player/new` and `/games/[gameId]/restore`.
  - Add alerting for missing identifiers to catch regressions in parameter wiring quickly.
- **Navigation**
  - Refresh global navigation, breadcrumbs, quick links, and toasts to use the new URLs and prefetch likely follow-ons.
  - Implement accessible focus management for routed modals to preserve keyboard/screen-reader flow.
  - Replace hard-coded path strings in navigation helpers with centralized utilities aware of the new structure.
- **SEO & Sharing**
  - Provide `generateMetadata` (or equivalent) for entity routes so shared URLs show correct titles/previews.
  - Mark modal/intermediate routes as non-indexable where appropriate.
  - Update share/export flows (e.g., scorecard summary exports) to copy the new URL patterns.
- **Error Handling**
  - Integrate entity-specific not-found components with global error boundaries to cover server/edge failures gracefully.
  - Surface actionable error messaging (offline, storage blocked) within routed modals and detail pages.
  - Capture error telemetry for missing entities to monitor frequency and diagnose issues.
- **Persistence Lifecycle**
  - Document retention policies (e.g., `sp/game-index` capacity) so not-found copy can explain when data expires.
  - Invalidate caches when archives are purged so stale IDs immediately show the not-found state.
  - Coordinate cross-tab sync (storage events, BroadcastChannel) to close modals if underlying entities change elsewhere.
- **Migration**
  - Use feature flags or temporary redirects (e.g., `/single-player` legacy shim) to stage rollout safely.
  - Update documentation/support materials with the new URL patterns and refreshed screenshots.
  - Communicate changes via release notes or in-app messaging so users can refresh bookmarks.
- **Testing**
  - Expand Playwright coverage for back/forward sequences across the new routes and modals.
  - Add unit/integration tests for path parsing in `StateProvider` and navigation helpers to prevent regressions.
  - Include cross-tab scenarios (storage resets, archive actions) to verify routed flows stay synchronized.

**Testing & QA**

- Add Playwright smoke tests covering direct navigation to each view URL, including reload + back/forward behavior.
- Add unit tests for selectors/helpers that now take `gameId` to ensure correct state resolution.
- Verify analytics events include `gameId` for each view and are emitted once per navigation.
- Regression-test roster setup, quick start, and time-travel/debug tooling with the new routes.
- Add integration coverage for snapshot recovery: start a game, navigate to `/single-player/{gameId}/scorecard`, reload, and assert the state rehydrates from IndexedDB (consider a test-only hook that exercises `rehydrateSinglePlayerFromSnapshot`).
- Manually validate the `localStorage` fallback by simulating IndexedDB failures and ensuring a deep link still renders (layout should surface an actionable error if both storages miss).
- Add Score Card deep link tests: create a scorecard session, capture its ID, reload `/scorecard/{scorecardId}` (and `/summary`), and confirm scores persist.
- Cover `/players/{playerId}` and `/rosters/{rosterId}`: ensure navigation from list → detail and cold deep link both hydrate the correct entity, including 404 handling.
- Expand analytics assertions to include `scorecardId`, `playerId`, and `rosterId` dimensions where emitted.
- Validate `/games/{gameId}` detail loads, and that `/games/{gameId}/restore` and `/games/{gameId}/delete` modals present confirmation flows before redirecting; assert popping history returns to the list without state loss.
- Add regression coverage for `/players/archived` and `/rosters/archived` deep links so archived views remain selected after reload/back navigation.
- Add a happy-path + confirmation-path test for `/single-player/new`: hitting the base route with no progress should auto-create a new run; hitting `/single-player/new/archive` with progress should archive then redirect; `/continue` should return to the existing game with history intact.
- Add "entity missing" tests for each detail route (single-player, scorecard, player, roster, archived game) verifying missing IDs render the CTA panel and that the primary/secondary actions link to the correct create/list/archives destinations.

**Risks & Mitigations**

- **State Drift:** Multiple URLs referencing different game IDs could expose stale state. Mitigate by centralizing `gameId` resolution in the layout and guarding pages with redirects when data is missing.
- **Hydration Mismatch:** Client-only components in nested routes may mismatch on first render. Mitigate with consistent client boundaries (`'use client'`) and shared skeleton loaders in `loading.tsx` files.
- **Legacy Links:** Existing bookmarks to `/single-player` could break. Provide a default redirect to the latest game or setup screen to maintain continuity.
- **Snapshot Retention:** The IndexedDB `sp/game-index` keeps at most 8 recent games. Document how older URLs behave (e.g., redirect to setup with a toast) and surface clear messaging when a snapshot is outside the retention window.
- **Score Card Persistence Gap:** Until a dedicated snapshot exists, `/scorecard/{scorecardId}` depends on the archived games database; communicate load latency expectations and add optimistic UI while records stream in.
- **Entity Permissions:** Deep-linking `/players/{playerId}` or `/rosters/{rosterId}` may expose archived or restricted entries. Define guards and redact sensitive data before rendering shareable views.

**Open Questions**

- Do we support multiple concurrent Single Player games or only the most recent? This impacts how `/single-player` chooses a `gameId`.
- Should scorecard/summary be read-only, or can users edit/bid from those views? Behavioural differences must be captured in the plan.
- How should time-travel/debug tooling represent the active view—should URLs change during rewind replay?
- What is the canonical ID source for Score Card sessions (existing `GameRecord.id` vs. new UUID)? Consistency is required across persistence, analytics, and sharing links.
- Should `/players/{playerId}` and `/rosters/{rosterId}` render editable forms by default, or gate edits behind an explicit "Edit" action to avoid accidental mutations from shared links?
