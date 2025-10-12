# Implementation Plan: Player Statistics Feature

This plan decomposes the work described in `PLAYER_STATISTICS.md` into phased engineering tasks. Each phase ends with validation steps, required tests, and documentation / commit expectations.

## Current Progress & Gaps

- Phase 7 work has started while outstanding tasks from earlier phases remain. This doc now calls out the catch-up tasks that must close before we declare Phase 7 complete.
- Canonical player id normalization can no longer wait for post-launch; the migration and backfill move into the mainline schedule (Phase 2).
- Statistics selectors must consume the normalized archive shape before the UI work in later phases can surface accurate numbers.
- Audit (2025-10-11): archived summaries still rely on slot-based ids; the backfill job and metadata versioning are not implemented. Round/hand/advanced analytics remain placeholder UI blocks in `PlayerStatisticsView.tsx`.

## Phase 1 – Routing & Base View

**Goals**

- Add a dedicated route (e.g., `/players/:playerId/statistics`) consistent with existing router conventions.
- Implement a `PlayerStatisticsView` container that fetches selector output, handles loading/error states, and renders placeholder layout with skeleton components.
- Wire up player selection UX (dropdown/search) using existing roster/player selectors.

**Tasks**

1. **Routing**
   - Extend router configuration (React Router or app-specific) to register the statistics path.
   - Ensure deep-linking support and page title updates follow existing patterns.
2. **Container Component**
   - Scaffold `PlayerStatisticsView` that:
     - Uses the typed `PlayerStatisticsSummary` selector.
     - Shows skeletons while `isLoadingLive`/`isLoadingHistorical` are true.
     - Displays error fallback when `loadError` is populated.
   - Implement cross-tab sync hook subscribing to `subscribeToGamesSignal`.
3. **Player Selector UI**
   - Reuse existing components for roster/player selection.
   - Persist selection in URL/query state to support shareable links.
4. **Docs & Types**
   - Export selector types (if not already) from a central `types` module.
   - Update documentation (`PLAYER_STATISTICS.md`) if implementation deviates.

**Validation**

- Navigate to the new route and confirm skeleton view renders.
- Toggle player selection; URL updates correctly.
- Cross-tab signal mock triggers re-fetch logic in dev tools.

**Testing**

- Unit tests for the hook that listens to `subscribeToGamesSignal`.
- Component tests verifying loading, error, and empty states.
- Snapshot/visual test (optional) for skeleton layout.

**Commit**

- Commit Phase 1 changes once tests pass.

## Phase 2 – Primary Metrics

**Goals**

- Deliver accurate totals for games played, games won, and win rate within `PlayerStatisticsSummary.primary`.
- Hydrate statistics from both the live Redux state and archived `GameRecord` bundles while preserving loading/error states introduced in Phase 1.

**Entry Criteria**

- Phase 1 routing + skeleton UI merged and `PlayerStatisticsView` renders without runtime warnings.
- `useGamesSignalSubscription` unit tests (Phase 1) are green and demonstrate cross-tab handling.
- Access to the current `AppState` via `useAppState()` on the statistics page is confirmed (no SSR gaps).

**Tasks**

1. **Loader Contract & Cache Primitives**
   - Extend `PlayerStatisticsLoadInput` in `lib/state/player-statistics.ts` to require a `stateSnapshot: AppState` and optional `cacheKey?: string`.
   - Export `resetPlayerStatisticsCache()` (alongside the existing factory helpers) so the view can bust caches when cross-tab signals arrive.
   - Add `lib/state/player-statistics/cache.ts` to hold a module-level `Map<string, NormalizedHistoricalGame>` with `getCached`, `setCached`, and `reset` helpers; re-export these via the main barrel.

2. **Historical Bundle Normalization (Pulled Forward)**
   - Update `summarizeState` so archived game summaries always persist canonical player ids, roster snapshots, and slot-to-id mappings required by `PLAYER_STATISTICS.md`.
   - Add `summary.metadata = { version: <new number>, canonicalRosterSnapshot }` and ensure the serializer writes `playersById`, `playerTypesById`, `displayOrder`, `dealerId`, `leaderId`, `trickCounts`, and per-round canonical ids.
   - Implement `runHistoricalSummaryBackfill` (in `lib/state/player-statistics/backfill.ts`) that:
     - Iterates `listGames()` for records missing the new metadata version.
     - Replays each bundle through the reducer to recover canonical ids and scores, then writes the enriched summary back (preserving the original bundle/timestamps).
     - Records progress via `archivalBackfillVersion` in IndexedDB/localStorage and exposes success/error counters for telemetry.
   - Gate the backfill behind a feature flag/readiness check so Phase 2 can land incrementally; document how to temporarily disable when debugging.
   - Block the statistics loader on the backfill promise the first time it runs so primary metrics never see slot-based ids.

3. **Historical Aggregation**
   - Create `normalizeHistoricalGame(record: GameRecord)` returning `{ id, finishedAt, playerIds, scores, winnerIds }` (winner detection prefers `summary.winnerId`, otherwise collects all players with the max score).
   - Fetch archived games with `listGames()` inside a `try/catch`. Normalize only the first time a `gameId` is seen and store the result in the cache.
   - Filter to games that include the target player (check both `summary.playersById` and `summary.scores` for safety).
   - Accumulate `historicalGamesPlayed`, `historicalGamesWon`, and push each final score into an array for secondary metrics later.
   - On IndexedDB failure, surface a descriptive `loadError` but keep live metrics populated.

4. **Live Aggregation**
   - Implement a pure helper `deriveLivePrimaryMetrics(stateSnapshot, playerId)` returning `{ gamesPlayed: 0 | 1, gamesWon: 0 | 1, score: number | null }`.
   - Treat a game as complete when either:
     - `stateSnapshot.sp.phase` is `'summary' | 'game-summary' | 'done'`, or
     - `selectIsGameComplete(stateSnapshot)` (from `lib/state/selectors`) returns `true` for scorecard sessions, or
     - `stateSnapshot.sp.summaryEnteredAt` is a finite number.
   - Compare the player’s score to the max score in `stateSnapshot.scores`; count ties as wins for now (add a code comment referencing the open question in `PLAYER_STATISTICS.md`).
   - Return zeros immediately if the player is not present in `stateSnapshot.players`.

5. **Summary Assembly & Error Wiring**
   - Merge live and historical aggregates into a `PrimaryMetrics` object with numeric defaults (`0` wins/plays and `0` win rate when no completed games exist).
   - Compute `winRatePercent` using safe division and round to one decimal (`Math.round(value * 10) / 10`).
   - Populate `PlayerStatisticsSummary` with `isLoadingLive`/`isLoadingHistorical` set to `false` once the async work resolves, even when `loadError` is populated.
   - Return `createEmptyPlayerStatisticsSummary` when the player cannot be found after trimming the id to match existing guards.

6. **PrimaryStatsCard UI**
   - Add `app/players/[playerId]/statistics/components/PrimaryStatsCard.tsx` plus an SCSS module for layout/typography.
   - Accept props `{ loading: boolean; metrics: PrimaryMetrics | null; error?: string | null; }` and render three inline metric tiles (“Total games”, “Wins”, “Win rate”).
   - Format integers with `Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })` and percentages with `Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1, minimumFractionDigits: 0 })`.
   - Show an empty-state message when `metrics.totalGamesPlayed === 0` and hide it while loading.
   - Preserve the skeleton rows while either loading flag is true; swap in the card body otherwise.

7. **View Integration**
   - Replace the placeholder copy in `PlayerStatisticsView` (primary metrics card) with the new component, wiring `loading` from `summary.isLoadingLive || summary.isLoadingHistorical`.
   - Pass `state` from `useAppState()` and a cache-busting key (e.g., `${reloadKey}`) into `loadPlayerStatisticsSummary`.
   - Call `resetPlayerStatisticsCache()` inside the `useGamesSignalSubscription` handler before incrementing `reloadKey`.

8. **Performance & Telemetry**
   - Keep normalization O(players) per game and avoid deep cloning by constructing new objects directly.
   - Optionally gate a `console.debug` message (development only) when returning live-only stats to aid future diagnostics.
   - Document cache behaviour and invalidation expectations in `cache.ts`.

**Status**

- ✅ Canonical roster snapshot + `metadata.version` now persisted in `summarizeState`; archived bundles emit alias maps for selectors.
- ✅ Historical backfill orchestration added via `ensureHistoricalSummariesBackfilled`; it honors the `NEXT_PUBLIC_PLAYER_STATS_BACKFILL_ENABLED` flag, runs `runHistoricalSummaryBackfill` once, and persists completion to localStorage to avoid duplicate work.
- ✅ Devtools expose a manual per-game backfill workflow with copy-to-clipboard support and a remaining-game counter for QA.
- ✅ Loader now waits for `ensureHistoricalSummariesBackfilled`, resets caches when upgrades land, and relies solely on canonical ids; legacy summaries are skipped with a descriptive warning until backfilled.
- ✅ Primary + secondary metrics aggregate live and archived scores via `loadPlayerStatisticsSummary`.

**Validation**

- Run `runHistoricalSummaryBackfill` against legacy archives (missing canonical ids) and assert the summaries now expose the new `metadata.version` and canonical roster snapshot.
- Seed IndexedDB with at least two archived games and confirm totals/win rate match manual calculations for a player present in both wins and losses.
- Finish a live game in the current tab; verify totals increment without a reload.
- Simulate `emitGamesSignal({ type: 'added', gameId })` (or delete) and confirm the card refreshes with updated counts.
- Disable IndexedDB (private browsing) to ensure a load error message displays while the card still falls back to live totals or zero values.

**Testing**

- Unit tests for the normalization/backfill helpers (`tests/unit/state/player-statistics/historical-normalization.test.ts`) covering new vs. legacy summaries, slot mapping edge cases, and error paths.
- `tests/unit/state/player-statistics/primary-metrics.test.ts` covering: no games, live-only completion, archived wins/losses, tie handling, and IndexedDB failure.
- Component tests (`tests/unit/components/player-statistics/primary-stats-card.test.tsx`) for loading, populated, and empty states (verify formatted text).
- Update `tests/unit/components/player-statistics/player-statistics-view.test.tsx` to expect the new loader signature (`{ playerId, stateSnapshot, cacheKey }`) and assert that rendered totals match the resolved summary.
- Integration-style render test that stubs `loadPlayerStatisticsSummary` to return populated metrics and verifies the skeleton is replaced by metric tiles.

**Commit**

- Commit Phase 2 once the updated tests and lint pass (`pnpm test player-statistics`, `pnpm lint`).

## Phase 3 – Secondary Metrics

**Goals**

- Implement average score, highest score, lowest score.
- Add bid accuracy and placement trend readouts to contextualize score performance.
- Render `SecondaryStatsCard` with trend indicators as defined in visualization guidance.

**Current State (2025-10-11)**

- ✅ Score-based aggregates (`averageScore`, `highestScore`, `lowestScore`) flow from `loadPlayerStatisticsSummary` into `SecondaryStatsCard`.
- ✅ Component-level coverage exists for score rendering/empty states in `tests/unit/components/player-statistics/secondary-stats-card.test.tsx`.
- ❌ `SecondaryMetrics` omits `averageBidAccuracy` and `medianPlacement`; selectors return `null` for contextual metrics.
- ❌ No derivation utilities replay round results or placements; historical aggregation stops at score totals in `lib/state/player-statistics.ts`.
- ❌ UI only surfaces three tiles; there is no space or copy prepared for accuracy/placement trends.
- ❌ Secondary metric tests do not exercise bid accuracy, placement ordering, or mixed live/historical inputs.

**Tasks to Continue Phase 3**

1. **Selector Enhancement**
   - Expand `SecondaryMetrics` (in `lib/state/player-statistics.ts`) to include `averageBidAccuracy` (0–100 percentage) and `medianPlacement` (1–4 range, nullable).
   - Extend `loadPlayerStatisticsSummary` and `computeHistoricalAggregates` to combine bid accuracy + placement data from live state and normalized archives.
     - Introduce helper(s) (e.g., `accumulateBidAccuracy`, `accumulatePlacements`) that accept `NormalizedHistoricalGame` and replay round winners/placements.
     - Leverage canonical player ids produced in Phase 2; bail out gracefully when a game predates the metadata migration.
   - Ensure `null` handling for players without completed games or without placement data (e.g., forfeits).
   - Update cloning utilities and type guards so the new fields survive memoized updates.
2. **UI**
   - Refresh `SecondaryStatsCard` layout to surface five metric tiles (score trio + bid accuracy + median placement) while preserving responsive breakpoints in `SecondaryStatsCard.module.scss`.
   - Add iconography/ARIA copy for bid accuracy (percentage) and placement (ordinal suffix) with tooltip affordances.
   - Hook up skeletons and error fallbacks for the new metrics; loading states should cover all values.
3. **Documentation**
   - Update `PLAYER_STATISTICS.md` if the metric naming or visualization differs from the original guidance.

**Status**

- [ ] Selector coverage for `averageBidAccuracy` and `medianPlacement` derived from live + archived games.
- [ ] `SecondaryStatsCard` visual and accessibility updates for five-metric layout (score + trends).
- [ ] Unit tests spanning mixed datasets (no games, live-only, archives-only, combined) for the new metrics.
- ✅ Score-based aggregates (average/highest/lowest) and existing tests remain stable.

**Validation**

- Manual QA with sample data for edge cases (negative scores, zero games).
- Check tooltips and accessibility labels meet requirements.

**Testing**

- Selector unit tests covering score aggregates, bid accuracy math, and placement ordering (including divide-by-zero and no-placement cases).
- Component tests verifying formatting (percent rounding, ordinal suffixes) and tooltip/ARIA exposure for all five metrics.
- Integration-style test in `tests/unit/components/player-statistics/player-statistics-view.test.tsx` confirming the view renders new metrics once the loader resolves.

**Next Actions**

- Extend `lib/state/player-statistics.ts` to calculate `averageBidAccuracy` and `medianPlacement` when assembling the secondary metrics payload (ensure cloning helpers copy the new fields).
- Replay canonical round metadata in a new helper module (e.g., `lib/state/player-statistics/secondary.ts`) so bid accuracy/placement logic stays isolated and testable.
- Refresh `app/players/[playerId]/statistics/components/SecondaryStatsCard.tsx` (and module stylesheet) to render five metrics with appropriate icons, tooltips, and responsive rules.
- Add unit coverage in `tests/unit/state/player-statistics` for accuracy/placement aggregation and extend `secondary-stats-card` spec to assert the new UI.

**Commit**

- Commit Phase 3 after validations and tests.

## Phase 4 – Tertiary Metrics (Round-Level)

**Goals**

- Compute average bids, highest/lowest bids, round-by-round accuracy.
- Visualize accuracy via heatmap/table per guidance.

**Tasks**

1. **Selector Work**
   - Replay `bid/set` and `sp/round-tally-set` events for archived games.
   - Merge data with live `state.rounds` / `state.sp.roundTallies`.
   - Populate `RoundMetric[]` in the summary.
2. **UI Components**
   - Implement `RoundAccuracyChart` using `@visx/heatmap` (or composed SVG primitives) for the ten-column grid with interactive tooltips and keyboard focus rings.
   - Include summary row with aggregated metrics.
3. **Performance**
   - Batch event replay and cache results per game.

**Status**

- [x] Selector refactor replays historical round data and merges live round snapshots into `RoundMetric[]`.
- [x] `RoundAccuracyChart` renders interactive heatmap with summary metrics and keyboard/tooltips wired.
- [ ] Mobile tooltip affordances pending design sign-off.

**Validation**

- Verify heatmap accuracy using test data.
- Confirm keyboard navigation and tooltips accessible.

**Testing**

- Selector unit tests with synthetic bundles.
- Component interaction tests ensuring correct aria labels and focus order.
- Unit coverage added in `tests/unit/state/player-statistics/round-metrics.test.ts` and `tests/unit/components/player-statistics/round-accuracy-chart.test.tsx`.

**Commit**

- Commit Phase 4 once validations pass.

## Phase 5 – Tertiary Metrics (Hand-Level)

**Goals**

- Derive hand-level insights (hands played, suit distribution, most frequent suit) for a selected player using canonical ids.
- Render `HandInsightsCard` with totals, top-suit callout, and responsive suit distribution visualization.

**Tasks**

1. **Selector & Aggregation**
   - Extend `HandInsight` (in `lib/state/player-statistics.ts`) to include:
     - `totalHandsPlayed`, `topSuit`, and `suitDistribution` keyed by canonical suit (`clubs|diamonds|hearts|spades`).
     - Optional `lastUpdated` timestamp for telemetry/debug (mirrors other metrics).
   - Implement `accumulateHandInsights()` in a new module (`lib/state/player-statistics/hands.ts`) that:
     - Replays archived `sp/trick/played` events per `GameRecord` using canonical player ids from Phase 2 metadata.
     - Aggregates counts per suit and returns total hands played for the requested player.
     - Handles legacy summaries (missing canonical metadata) by short-circuiting with `null` and logging a debug warning.
   - Merge live state fallback via `state.sp.trickPlays` only when IndexedDB replay fails, and gate it behind the same readiness flag used in Phase 2 backfill.
   - Export memoized helpers (`getHandInsightsFromGame`, `mergeHandInsightTotals`) and ensure `loadPlayerStatisticsSummary` populates `summary.handInsights`.
   - Add cache integration (shared `cache.ts`) so replayed suit counts memoize per `gameId` + `playerId`.
2. **UI Implementation**
   - Build `HandInsightsCard` in `app/players/[playerId]/statistics/components/HandInsightsCard.tsx` that:
     - Shows total hands played, most frequent suit with iconography, and tie-breaker messaging when suits equal.
     - Renders a horizontal suit distribution bar chart using `@visx/shape` (`BarGroup` or `BarStack`) with animation disabled for deterministic tests.
     - Supports loading skeletons (`Skeleton` blocks for total/top suit/chart) and error/empty states (guidance copy).
   - Create `HandInsightsCard.module.scss` leveraging existing spacing vars; ensure the chart respects tablet breakpoints (wrap chart below stats at ≤768px).
   - Wire card into `PlayerStatisticsView` layout beneath round insights.
3. **Accessibility & Localization**
   - Add localized strings (e.g., `playerStatistics.handInsights.totalHands`, `playerStatistics.handInsights.topSuit`) to `app/i18n/en/player-statistics.json`.
   - Provide visually hidden labels describing suit bars (percentage + absolute count) and ensure `role="img"`/`aria-label` on icons.
   - Include keyboard-focusable tooltip triggers or inline descriptions; confirm high-contrast mode readability.
   - Document pronunciation guidance in `PLAYER_STATISTICS.md` if localization deviates (e.g., ordinal phrasing for suit rank).

**Status**

- [x] Historical hand replay uses canonical metadata and caches per-game insights.
- [x] `HandInsightsCard` renders totals, top suit, and responsive bar chart without overflow issues.
- [ ] Localization keys + screen reader copy approved and merged.

**Validation**

- Run backfill-enabled dev build, seed archives with multi-game history, and compare per-suit totals against manual tallies.
- Toggle feature flag to simulate missing archives; ensure live-state fallback returns consistent counts or `null` with warning.
- Verify chart responsiveness across mobile/tablet/desktop and confirm no horizontal scroll.
- Perform accessibility audit (keyboard focus, axe scan) on the card in both populated and empty states.

**Testing**

- Unit tests in `tests/unit/state/player-statistics/hand-insights.test.ts` covering:
  - Canonical replay of archived events (single suit dominance, mixed suits, zero plays).
  - Graceful handling of legacy summaries and live fallback.
  - Cache hits/misses and memoization guards.
- Component tests in `tests/unit/components/player-statistics/hand-insights-card.test.tsx` verifying:
  - Loading, empty, and populated renders.
  - Correct icon/label pairing and formatted totals.
  - Responsive snapshot (via container width mocks) to assert stacked layout.

**Commit**

- Commit Phase 5 once aggregation, UI, and test coverage land; include updated localization files and doc notes.

**Next Actions**

- Finalize `hands.ts` helper implementation and wire through the loader.
- Build the `HandInsightsCard` component + styles, then integrate into the statistics view.
- Author localization entries and run `pnpm lint`, `pnpm test --filter hand-insights` (or equivalent subset) before Phase 5 sign-off.

## Phase 6 – Advanced Metrics

**Goals**

- Deliver advanced analytics (trick efficiency, suit mastery, score volatility, momentum) derived from canonical events.
- Render `AdvancedInsightsPanel` with interactive charts and accessibility-compliant annotations.

**Current State (2025-10-11)**

- `AdvancedMetrics` is typed in `lib/state/player-statistics.ts`, but `loadPlayerStatisticsSummary` never hydrates it; the advanced card in the view always receives `null`.
- `NormalizedHistoricalGame` (see `lib/state/player-statistics/cache.ts`) only caches summary metadata. We do not persist per-trick timelines, trump history, or cumulative score differentials required for advanced analytics.
- `computeHistoricalAggregates` returns round, score, and hand data, yet does not expose the raw game list needed for streak/volatility calculations.
- `PlayerStatisticsView.tsx` still renders placeholder copy for the advanced panel; there is no `AdvancedInsightsPanel` component, stylesheet, or export wiring.
- No localization keys, telemetry hooks, or unit/component tests exist for these metrics.

**Tasks**

1. **Selector & Calculators**
   - Extend `AdvancedMetrics` in `lib/state/player-statistics.ts` (and exported helper types) so each sub-section can carry suit-level percentages, attempt counts, and nullable fields for incomplete data. Add strongly typed points for the momentum sparkline (e.g., `AdvancedMomentumPoint`).
   - Enrich `NormalizedHistoricalGame` and caching:
     - Persist per-round trump suit, dealer, and ordered trick winners extracted from `sp/deal` and `sp/trick/cleared` events.
     - Capture per-trick play logs with canonical player ids + card suits (reuse alias normalization from `hands.ts`).
     - Store cumulative score snapshots per round (difference vs. table leader) so comeback/lead metrics do not require replaying tallies repeatedly.
     - Add a dedicated `advancedReplayCache` (either alongside `cache.ts` or in the new module) and expose `resetAdvancedMetricsCache()`.
     - Define an `AdvancedReplayContext` interface (gameId, finishedAt, trumpByRound, trickLog, perRoundScores, bids, placements) so calculators have a consistent contract.
   - Introduce `lib/state/player-statistics/advanced.ts`:
     - `buildAdvancedReplayContext(record, normalized)` → memoized per game, returning trump history, trick summaries, per-suit tallies, cumulative score deltas, and win/loss outcome.
     - Calculator helpers:
       - `calculateTrickEfficiency(context, playerId)` – compute `averageDelta` (mean of `actual - bid` across all completed rounds), longest `perfectBidStreak`, and per-suit trick win percentages derived from the trick summaries.
       - `calculateSuitMastery(context, playerId)` – combine trump history with trick logs to populate `trumpWinRateBySuit` (rounds won when trump was the suit / rounds played with that trump) and `trickSuccessBySuit` (tricks won for each leading suit / tricks contested in that suit). Return `null` fields for suits with <3 attempts.
     - `calculateScoreVolatility(context, playerId)` – aggregate final scores across games to produce standard deviation, then walk the cumulative score timeline to determine `largestComeback` (biggest negative differential that ended in a win) and `largestLeadBlown` (biggest positive differential in a game the player ultimately lost).
     - `calculateMomentum(context, playerId, { windowSize = 5 })` – sort games by `finishedAt`, compute rolling averages over the chosen window (fall back to smaller window when history is short), and derive `currentWinStreak`/`longestWinStreak` by scanning the chronological win/loss sequence. Include the current live game when the reducer says it is complete.
   - `accumulateAdvancedMetrics({ historicalGames, liveContext, playerId })` – orchestrate the calculators, merge historical + live samples, and normalize `null` fallbacks so UI logic stays simple.
   - Update `computeHistoricalAggregates` to return the list of normalized games (in finish order) and any data the advanced calculators require but currently discard (e.g., derived secondary metrics). Thread that through `loadPlayerStatisticsSummary`, invoke `accumulateAdvancedMetrics`, and assign the result to `summary.advanced`.
   - Ensure live-state parity:
     - Extend `deriveLiveMetrics` to emit the live trick log, trump suit, and per-round score differentials when the current game is complete.
     - Share normalization helpers with the historical path to avoid drift.
   - Wire `resetPlayerStatisticsCache()` to clear secondary, hand, and new advanced caches together so cross-tab refreshes rebuild the analytics coherently.
2. **UI Implementation**
   - Build `AdvancedInsightsPanel` (`app/players/[playerId]/statistics/components/AdvancedInsightsPanel.tsx`) with sections:
     - Trick efficiency badges (overall delta + perfect streak) including per-suit chips with directional glyphs.
     - Suit mastery matrix (grid) that highlights best/worst trump performance and exposes per-suit trick success bars.
     - Score volatility + rolling average sparkline using `@visx/xychart`; expose focusable markers for key games.
     - Momentum summary card with current/longest streaks, comeback badges, and contextual copy.
   - Create `AdvancedInsightsPanel.module.scss`, following the metrics card spacing tokens, stacking columns at ≤1024px, and clamping chart heights for small screens.
   - Add presentational helpers if needed (`MomentumSparkline`, `SuitMasteryMatrix`, etc.) but keep them colocated under the same directory for testability.
   - Replace the placeholder block in `PlayerStatisticsView.tsx` with the new panel, ensuring the skeleton path matches other cards and `loadError` propagation continues to work.
   - Update `page.module.scss` as needed to accommodate the additional grid rows/ARIA hooks.
3. **Accessibility, Localization, & Telemetry**
   - Add `playerStatistics.advanced.*` keys to `app/i18n/en/player-statistics.json` (labels, tooltips, aria strings, empty-state copy).
   - Provide ARIA descriptions for charts (`aria-describedby` with hidden text), ensure keyboard focus lands on interactive elements, and include screen-reader-only summaries for streak/comeback metrics.
   - Emit `performance.mark` / `measure` entries around `accumulateAdvancedMetrics` and each calculator, then document the new diagnostics in `PLAYER_STATISTICS.md`.
   - Extend existing telemetry/logging hooks (or add lightweight console debug behind a feature flag) to capture cache hit ratios and processing duration.
4. **Performance & Guardrails**
   - Ensure `buildAdvancedReplayContext` walks each event sequence once and memoizes the derived data per game.
   - Debounce cross-tab refresh triggers (e.g., 250 ms) before clearing caches and reloading stats to avoid repeated expensive recomputation.
   - Guard against oversized histories: cap rolling-average window size, short-circuit suit mastery when the dataset exceeds cache limits, and surface a warning banner if metrics are truncated.
   - Document the tested archive size thresholds and fallback behaviour in the implementation notes (append to `PLAYER_STATISTICS.md` or a new `docs` entry).

**Status**

- [ ] Advanced calculators replay canonical events once and hydrate all required metrics.
- [ ] `AdvancedInsightsPanel` renders trick efficiency, suit mastery, volatility, and momentum sections with responsive behavior.
- [ ] Accessibility, localization, and telemetry updates approved.
- [ ] Performance guardrails (memoization + debounced refresh) land and verified.

**Validation**

- Compare calculator output against curated sample datasets (short streaks, long archives, extreme volatility).
- Simulate addition/removal of games via cross-tab signals and confirm metrics update without perceptible lag.
- Run manual QA on desktop + mobile for chart interactions, tooltips, and color contrast (include dark mode if supported).
- Capture telemetry samples to confirm performance marks/logs populate expected dashboards.

**Testing**

- Unit tests in `tests/unit/state/player-statistics/advanced-metrics.test.ts` covering:
  - Trick efficiency and suit mastery math (zero-attempt suits, ties, trump rotation edge cases).
  - Volatility calculations (standard deviation, rolling window) with deterministic per-round score timelines.
  - Momentum streak detection across mixed win/loss sequences, short histories (<5 games), and live-game inclusion.
  - Cache hit/miss behaviour and guard rails for oversized histories.
  - Introduce shared fixtures (e.g., `tests/fixtures/player-statistics/advanced-scenarios.ts`) that build `AdvancedReplayContext` objects from synthetic event streams; reuse across specs for clarity.
- Component tests in `tests/unit/components/player-statistics/advanced-insights-panel.test.tsx` verifying:
  - Skeleton/error handling, chart rendering, tooltip content, ARIA labels.
  - Responsive layout snapshots and keyboard navigation across interactive elements (stub `@visx` primitives as needed).
- Optional visual regression (Percy/Chromatic) once charts stabilize; document baseline requirement.

**Commit**

- Commit Phase 6 once calculators, UI, accessibility, and telemetry are complete and tests/lint pass.

**Next Actions**

- Finish `advanced.ts` calculators with shared replay context, add the new caches, and thread them through `loadPlayerStatisticsSummary`.
- Build `AdvancedInsightsPanel` + styles, integrate localization strings, and wire it into the statistics view (replacing the placeholder node).
- Author unit/component tests, regenerate localization bundles, and run targeted suites (`pnpm test --filter advanced-metrics`, `pnpm lint`). Coordinate with design for volatility sparkline review before merging.

## Phase 7 – Docs, Cleanup, and Final Validation

**Goals**

- Ensure documentation and type exports reflect the final statistics implementation.
- Eliminate temporary flags/dead code, stabilize telemetry, and complete cross-phase QA debt.
- Run the full validation matrix (lint, unit, integration, visual, manual) before release.

**Tasks**

1. **Backlog Audit & Catch-up (Pre-flight)**
   - Confirm Phase 2 canonical-id backfill telemetry shows 100% upgraded summaries; remove feature flag + delete legacy slot-mapping utilities (`lib/state/player-statistics/slot-utils.ts` or similar).
   - Verify Phase 3 secondary metrics populate fully in `SecondaryStatsCard` and clear any temporary `TODO` annotations or placeholder copy.
   - Ensure Phase 4 round accuracy chart resolves mobile spacing QA bugs; close associated tracking issues.
   - Validate Phase 5 hand insights use canonical archives exclusively—remove live-state fallback once backfill proven.
   - Finalize Phase 6 advanced calculators (memoization flags, perf marks); resolve design QA on volatility sparkline and delete experimental prototypes.
   - Log any remaining deferrals in `SCRATCH_PAD.md` with owner + follow-up milestone.
2. **Documentation & Knowledge Base**
   - Update `PLAYER_STATISTICS.md` with final data contracts, feature flags removed, and telemetry expectations.
   - Refresh `README.md`/developer onboarding snippets describing IndexedDB backfill/replay flows and how to run stat-specific tests.
   - Add doc comments in `lib/state/player-statistics/*.ts` summarizing canonical id assumptions and cache invalidation.
   - Produce `docs/player-statistics-validation.md` summarizing QA steps, telemetry dashboards, and rollback plan.
3. **Type & Module Hygiene**
   - Audit exports from `lib/state/player-statistics/index.ts` ensuring `PlayerStatisticsSummary`, `RoundMetric`, `SuitInsight`, `AdvancedMetricTrend`, and helper types are publicly available and deduplicated.
   - Remove obsolete factories, slot-based helpers, temporary feature-flag hooks, and unused components (e.g., `PlaceholderRoundCard`).
   - Ensure `cache.ts` exposes only necessary APIs, and add guard rails (e.g., size limits) if left permanent—document rationale.
4. **Validation & Release Prep**
   - Run project-wide checks: `pnpm lint`, `pnpm test`, `pnpm test:integration`, `pnpm test:visual` (or targeted equivalents).
   - Execute smoke tests in real browsers (desktop + mobile) covering: route navigation, cross-tab sync (emit manual signal), offline IndexedDB unavailability, and localization toggle.
   - Capture final screenshots/videos for design/product sign-off; attach to release notes.
   - Review telemetry dashboards for anomalies during dry run; tune alert thresholds if necessary.

### Phase 7 Audit Snapshot – 2025-10-11

- Canonical-id enrichment shipped: `summarizeState` now writes `metadata.version`, roster snapshots, alias maps, and devtools expose a manual per-game backfill flow for QA validation.
- Statistics loader skips legacy summaries until they are backfilled and drops slot/name heuristics; accuracy/placement secondary metrics remain TODO before Phase 7 sign-off.
- `PlayerStatisticsView.tsx` shows placeholder copy for Round accuracy, Hand insights, and Advanced analytics; components (`RoundAccuracyChart`, `HandInsightsCard`, `AdvancedInsightsPanel`) do not exist yet.
- QA debt: no telemetry wiring, no integration tests for canonical backfill, and no mobile layout validation for tertiary/advanced cards.
- Action: block Phase 7 completion on delivering the missing selectors/components, then re-run the full validation pass once feature parity is achieved.

**Validation**

- Telemetry dashboards show backfill success ≥ 99% with no unhandled errors; alerting thresholds configured.
- Full manual smoke on desktop/tablet/mobile verifying populated + empty states, localization, dark mode (if available), and cross-tab refresh accuracy.
- Review TypeScript build output (`pnpm build`) to ensure no unused export/namespace warnings.
- Validate release artifacts (bundle size comparison, source map generation) remain within budget.

**Testing**

- Full CI suite plus targeted reruns if flaky suites detected; confirm coverage thresholds maintained.
- Optional load test script (if available) to stress IndexedDB replay and ensure caching behaves under repeated tab refresh.

**Commit & Delivery**

- Final commit encapsulating doc updates, cleanup, and validation artifacts.
- Prepare release PR summarizing completed phases, test matrix, telemetry readiness, and attaching design sign-off assets.

**Next Actions**

- Complete backlog audit checklist; remove feature flags and legacy helpers.
- Update docs/README + add validation doc, then regenerate localization bundles if strings changed.
- Execute full validation suite and capture sign-off materials before tagging the release.

## Post-Launch Monitoring & Enhancements

**Goals**

- Observe the canonical-id pipeline and statistics selectors running in the wild, ensuring regressions are caught quickly.
- Iterate on polish items that were explicitly descoped from Phase 7 once stability is confirmed.

**Tasks**

1. **Telemetry & Alerting**
   - Keep dashboards for `runHistoricalSummaryBackfill` latency/error rates and set alerts when failure rate > 1%.
   - Track player-statistics selector duration (performance marks) and flag heavy hitters for memoization follow-ups.
2. **Data Quality Reviews**
   - Sample a subset of archived games each release, re-run the reducer locally, and compare with stored summaries for drift.
   - Add automated QA scripts that spot-check win-rate deltas and top suit counts against raw events.
3. **UX Enhancements**
   - Explore roster-level statistics or sharing flows once single-player stats prove sticky.
   - Gather feedback on chart readability/accessibility and schedule improvements (e.g., colorblind palettes, annotations).
4. **Tech Debt Cleanup**
   - Remove any residual feature flags after two stable releases.
   - Revisit storage limits and IndexedDB schema versioning strategy informed by live backfill metrics.

**Validation**

- Dashboards remain green for two consecutive releases with no alert fatigue.
- QA sampling finds no canonical-id drift or stat mismatches.

**Testing**

- Scheduled automation (CI cron) re-runs the data-quality smoke tests.
- Manual ad-hoc tests when new UX improvements land.
