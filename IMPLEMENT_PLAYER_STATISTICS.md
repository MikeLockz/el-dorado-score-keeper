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
- ✅ `runHistoricalSummaryBackfill` implemented with feature flag gating and localStorage marker to avoid duplicate work.
- ✅ Devtools expose a manual per-game backfill workflow with copy-to-clipboard support and a remaining-game counter for QA.
- ✅ Loader now relies solely on canonical ids; legacy summaries are skipped with a descriptive warning until backfilled.
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

**Status**

- [ ] Suit aggregation still using placeholder suit constants; canonical id->player mapping needs QA coverage.
- [ ] `HandInsightsCard` layout on tablet unresolved; bars overflow container.
- [ ] Screen reader copy pending localization review.

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

**Status**

- [ ] Trick efficiency calculator passes unit tests but still flagged for perf (needs memoization of event replay).
- [ ] `AdvancedInsightsPanel` skeleton states implemented; populated render blocked on finalized data contract.
- [ ] Volatility sparkline missing design QA review for color contrast.

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
- Close the remaining gaps from Phases 2–6 so the statistics experience is end-to-end complete.

**Tasks**

1. **Backlog Audit & Catch-up (Pre-flight)**
   - Validate the Phase 2 canonical-id backfill has finished successfully (telemetry shows 100% upgraded summaries) and remove temporary feature flags once confirmed.
   - Phase 3: Confirm secondary metric selectors (`averageScore`, `averageBidAccuracy`, `medianPlacement`, `highestScore`) are implemented with canonical ids and the `SecondaryStatsCard` renders without placeholders.
   - Phase 4: Ensure per-round accuracy replay uses the normalized archives, chart interactions work, and mobile layout issues flagged in QA are resolved.
   - Phase 5: Finish `HandInsightsCard` suit aggregation plus accessibility labels; remove the temporary live-state fallback once canonical metadata is guaranteed.
   - Phase 6: Verify advanced calculators (trick efficiency, streaks, volatility) ship with memoization/caching enabled and address any TODOs left in code comments.
   - Document any residual gaps in `SCRATCH_PAD.md` if they must slip post-launch.
2. **Documentation Updates**
   - Update `PLAYER_STATISTICS.md` and any README/usage docs with final implementation notes, including the new canonical id expectations and selector contracts.
   - Backfill JSDoc/inline comments where the canonical-id pipeline altered function signatures.
3. **Type & Module Hygiene**
   - Ensure TypeScript types exported for external reuse (`PlayerStatisticsSummary`, `RoundMetric`, `SuitInsight`, `AdvancedMetricTrend`), and delete duplicate interfaces left behind during refactors.
   - Remove unused utilities or placeholder code (old slot-based helpers, experimental components, or temporary feature flags).
4. **Full Validation Pass**
   - Run lint, unit, integration, and visual tests (`pnpm lint`, `pnpm test`, `pnpm test:integration`, `pnpm test:visual`).
   - Execute a manual smoke across desktop/mobile, including cross-tab synchronization in a real browser session, and capture screenshots for design sign-off.

### Phase 7 Audit Snapshot – 2025-10-11

- Canonical-id enrichment shipped: `summarizeState` now writes `metadata.version`, roster snapshots, alias maps, and devtools expose a manual per-game backfill flow for QA validation.
- Statistics loader skips legacy summaries until they are backfilled and drops slot/name heuristics; accuracy/placement secondary metrics remain TODO before Phase 7 sign-off.
- `PlayerStatisticsView.tsx` shows placeholder copy for Round accuracy, Hand insights, and Advanced analytics; components (`RoundAccuracyChart`, `HandInsightsCard`, `AdvancedInsightsPanel`) do not exist yet.
- QA debt: no telemetry wiring, no integration tests for canonical backfill, and no mobile layout validation for tertiary/advanced cards.
- Action: block Phase 7 completion on delivering the missing selectors/components, then re-run the full validation pass once feature parity is achieved.

**Validation**

- Telemetry dashboards show backfill success >= 99% with no unhandled errors.
- Manual smoke test across routes, verifying every card renders populated data when archives exist and falls back gracefully.
- Double-check cross-tab synchronization in real browser environment.

**Testing**

- Full CI suite.

**Commit & Delivery**

- Final commit with documentation updates.
- Prepare PR summarizing phases and validations.

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
