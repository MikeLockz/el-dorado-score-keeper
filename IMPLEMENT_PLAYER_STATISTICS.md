# Implementation Plan: Player Statistics Feature

This plan decomposes the work described in `PLAYER_STATISTICS.md` into phased engineering tasks. Each phase ends with validation steps, required tests, and documentation / commit expectations.

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
- Populate total games played/won and win rate.
- Ensure selector merges live game state with archived data.

**Tasks**
1. **Selector Implementation**
   - Implement data fetch from IndexedDB via helpers in `lib/state/io.ts`.
   - Derive `primary` metrics within `PlayerStatisticsSummary`.
   - Populate loading/error flags while asynchronous work resolves.
2. **UI Rendering**
   - Build `PrimaryStatsCard` with cards showing totals and win rate.
   - Add skeleton placeholders tied to selector flags.
3. **Performance Considerations**
   - Cache parsed `GameRecord` data keyed by `gameId`.
   - Memoize selectors via `reselect`-style utilities to avoid recomputation.

**Validation**
- With seeded data, verify totals and win rate match expectations.
- Confirm UI updates after completing a game in another tab (cross-tab sync).

**Testing**
- Selector unit tests using mock state and stubbed IndexedDB adapter.
- Component tests for `PrimaryStatsCard` covering loading/error states.
- Integration test verifying cross-tab signal triggers recompute (using fake timers/BroadcastChannel polyfill).

**Commit**
- Commit Phase 2 once tests succeed.

## Phase 3 – Secondary Metrics
**Goals**
- Implement average score, highest score, lowest score.
- Render `SecondaryStatsCard` with trend indicators as defined in visualization guidance.

**Tasks**
1. **Selector Enhancement**
   - Extend `PlayerStatisticsSummary` to populate `secondary` metrics from both live and archived games.
   - Ensure `null` handling for players without completed games.
2. **UI**
   - Implement `SecondaryStatsCard` with responsive design and tooltips.
   - Hook up skeletons and error fallbacks.
3. **Documentation**
   - Update docs/readme if new UI patterns introduced.

**Validation**
- Manual QA with sample data for edge cases (negative scores, zero games).
- Check tooltips and accessibility labels meet requirements.

**Testing**
- Selector unit tests for aggregation accuracy (including divide-by-zero cases).
- Component tests verifying formatting (e.g., rounding, percent display).

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

**Validation**
- Verify heatmap accuracy using test data.
- Confirm keyboard navigation and tooltips accessible.

**Testing**
- Selector unit tests with synthetic bundles.
- Component interaction tests ensuring correct aria labels and focus order.

**Commit**
- Commit Phase 4 once validations pass.

## Phase 5 – Tertiary Metrics (Hand-Level)
**Goals**
- Calculate hands played and most frequent suit using event replay.
- Render `HandInsightsCard` including suit distribution chart.

**Tasks**
1. **Selector**
   - Parse `sp/trick/played` events to produce suit counts and total hands.
   - Handle fallback to live `state.sp.trickPlays` when archives missing.
2. **UI**
   - Build card with suit icons, counts, and optional bar chart using `@visx/shape` primitives.
3. **Accessibility & Localization**
   - Ensure suits have descriptive labels and localization keys.

**Validation**
- Cross-check counts against known sample games.
- Confirm chart renders on mobile/desktop layouts.

**Testing**
- Selector tests for suit aggregation.
- Component tests verifying top suit selection.

**Commit**
- Commit Phase 5 once complete.

## Phase 6 – Advanced Metrics
**Goals**
- Implement trick efficiency, suit mastery, score volatility, and momentum metrics.
- Render `AdvancedInsightsPanel` with charts and analytics.

**Tasks**
1. **Selector Logic**
   - Add advanced metric calculations, ensuring caching of replayed data.
   - Populate `AdvancedMetrics` in summary.
2. **UI Implementation**
   - Build sparklines, matrices, and badges as defined in visualization guidance using `@visx/xychart` (or `@visx/line`) for rolling averages and streak trends.
   - Integrate skeletons and error fallbacks.
3. **Performance & Guardrails**
   - Debounce recomputations triggered by cross-tab updates.
   - Document thresholds for large history datasets.

**Validation**
- Compare output against manual calculations for sample datasets.
- Verify momentum charts update correctly after new games archive.

**Testing**
- Unit tests for advanced calculators (streaks, standard deviation, rolling averages).
- Component tests mocking complex data scenarios.
- Optional visual regression tests for charts.

**Commit**
- Commit Phase 6 after validations and tests.

## Phase 7 – Docs, Cleanup, and Final Validation
**Goals**
- Ensure documentation up to date and codebase adheres to patterns.
- Run full test suite and lint checks.

**Tasks**
1. Update `PLAYER_STATISTICS.md` and any README/usage docs with final implementation notes.
2. Ensure TypeScript types exported for external reuse.
3. Remove unused utilities or placeholder code.
4. Run lint, unit, integration, and visual tests.

**Validation**
- Manual smoke test across routes.
- Double-check cross-tab synchronization in real browser environment.

**Testing**
- Full CI suite.

**Commit & Delivery**
- Final commit with documentation updates.
- Prepare PR summarizing phases and validations.
