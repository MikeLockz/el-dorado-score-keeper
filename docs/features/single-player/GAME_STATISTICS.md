# Game Statistics Feature Plan

## 1. Context

- Build a game-focused analytics view that highlights the flow, key moments, and efficiency of a single game session using data already collected in the state tree and IndexedDB archives.
- The view should stitch together live session details (when the game is still in progress) and archived summaries (`GameRecord`s) without requiring server access.
- Initial scope centers on completed standard games; design the architecture so we can extend to alternative variants (short decks, house rules) or tournament aggregates later.

## 2. User & Business Goals

- **Primary user goal:** Let the table host or participants review a detailed post-game breakdown that explains how and why the outcome happened.
- **Supporting goals:**
  - Surface pivotal rounds, swings, and trick efficiency so players can pinpoint momentum shifts.
  - Capture metadata (duration, roster composition, streaks) that can power shareable recaps and reinforce return play.
  - Maintain parity between live post-game modal and archived game detail screens so analytics feel consistent anywhere they appear.

## 3. Data Inputs & Normalization

- **Games collection (IndexedDB):** Archived games reside in the IndexedDB `app-games-db` database under the `games` store (see `lib/state/io.ts`). Each `GameRecord` includes `summary`, `roundTallies`, and the original `bundle.events` stream (`game/start`, `round/start`, `sp/trick/played`, etc.) required to rebuild round-by-round flow.
- **State snapshot:** The active game reducer holds authoritative data while the game is in progress (`state.sp`, `state.rounds`, `state.scores`, `state.roundTallies`). The statistics view should consume selectors that merge this live snapshot with any persisted snapshot once the game reaches `phase === "complete"`.
- **Auxiliary stores:** The live `app-db` database stores the canonical `events` sequence. Use `exportBundle` or the reducer replay utilities when the active reducer instance cannot supply the full log (e.g., background tab).
- **Normalization:**
  - Convert `createdAt`, `summaryEnteredAt`, and per-round timestamps to `Date` instances when preparing duration metrics.
  - Ensure rounds are ordered numerically and include partial rounds (e.g., aborted final round) to avoid gaps in visualizations.
  - During replay, aggregate per-round trick counts and bids per player so we can derive game-wide efficiency metrics.
  - Treat bot players and placeholder seats consistently; statistics should be attributed to their canonical ids captured at archive time.

## 4. Metric Definitions

### 4.1 Primary Metrics

| Metric              | Definition                                                                 | Calculation                                                                                                     | Current Game Source                                                                         | Archived Games Source                                                                              |
| ------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Total Rounds Played | Number of rounds that reached scoring in this game                         | Count completed entries in `state.rounds` (include current when `phase === "summary"`)                          | `state.rounds.length` (fallback to `state.roundTallies` count when reducer trimmed history) | `GameRecord.summary.roundsCompleted` or length of `roundTallies`                                   |
| Game Duration       | Time elapsed from first deal to summary confirmation                       | Difference between first `game/start` or `createdAt` timestamp and `summaryEnteredAt` (fallback to `updatedAt`) | `state.metadata.startedAt` and `state.metadata.summaryEnteredAt` when available             | `GameRecord.summary.startedAt` and `summaryEnteredAt`; replay bundle timestamps if summary missing |
| Winning Margin      | Score delta between winner and runner-up at game end                       | Highest final score minus second-highest score (handle multi-way ties gracefully)                               | Derived from `state.scores` once phase is `summary`                                         | Use `GameRecord.summary.finalScores` or replay `score/set` events                                  |
| Perfect Bid Count   | Number of perfect rounds (bid equals tricks taken) achieved across players | Sum of rounds where any participant hit a perfect bid; record per-player contributions for detail overlays      | Evaluate `state.roundTallies` vs `state.rounds` bids                                        | Reconstruct from `GameRecord.roundTallies` or replay `sp/round-tally-set` events                   |

### 4.2 Round Momentum Metrics

| Metric                    | Definition                                                         | Calculation                                                                          | Current Game Source                             | Archived Games Source                                         |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------- |
| Largest Round Swing       | Maximum net score change for any player between consecutive rounds | Compute max absolute delta in `scores[playerId][round] - scores[playerId][round-1]`  | Use `state.scores` timeline                     | Replay `score/set` events per round                           |
| Lead Changes              | Number of times the leading player changed after a round           | Track sorted leaderboard per round and count identity switches                       | Derive from cumulative scores in reducer        | Use `GameRecord.summary.roundLeaders` or recompute via replay |
| Bid Accuracy Heatmap Data | Per-player per-round bid delta (tricks taken - bid)                | Record `roundTallies[playerId].tricks - rounds[roundIndex].bids[playerId]` per round | Combine `state.rounds` and `state.roundTallies` | Use `GameRecord.roundTallies` joined with replayed bids       |
| Round MVP                 | Player with highest positive contribution in a round               | Choose player with max `(roundScoreDelta)` and store tie metadata                    | Derived from reducer scoreboard deltas          | Replay scoreboard updates per round                           |

### 4.3 Player Impact Metrics

| Metric                  | Definition                                            | Calculation                                                            | Current Game Source                                  | Archived Games Source                                              |
| ----------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Clutch Performance      | Net points won in final two rounds by eventual winner | Sum score gains of game winner in last two rounds                      | `state.scores` timeline                              | Replay `score/set` events; fallback to `GameRecord.summary` fields |
| Trick Efficiency Spread | Variation between highest and lowest trick efficiency | Compute `tricksTaken / bid` per player, then `max - min`               | Combine `state.roundTallies` and `state.rounds` bids | Replay `sp/trick/played` to derive tricks per player               |
| Support Contributions   | Total points won via partners (team modes) or assists | Use team metadata to attribute trick wins to teammates when applicable | Requires `state.teams` / `state.roundTallies`        | Replay events with team info stored in `GameRecord.summary.teams`  |

## 5. Selector Contracts

Expose strongly typed selector outputs so UI modules remain declarative.

```ts
export type GamePrimaryMetrics = {
  totalRounds: number;
  durationMinutes: number | null;
  winningMargin: number | null;
  perfectBidCount: number;
};

export type GameMomentumMetrics = {
  largestRoundSwing: {
    round: number | null;
    playerId: string | null;
    delta: number;
  };
  leadChanges: Array<{ round: number; leaderIds: string[] }>;
  bidAccuracyGrid: Array<{
    round: number;
    deltas: Record<string, number>;
  }>;
  roundMvps: Array<{
    round: number;
    playerIds: string[];
    delta: number;
  }>;
};

export type GameImpactMetrics = {
  clutchPerformance: {
    playerId: string | null;
    points: number;
  };
  trickEfficiencySpread: {
    highest: { playerId: string; efficiency: number } | null;
    lowest: { playerId: string; efficiency: number } | null;
    spread: number | null;
  };
  supportContributions: Array<{
    teamId: string;
    points: number;
    playerBreakdown: Record<string, number>;
  }>;
};

export type GameStatsLoadState = {
  isLoadingLive: boolean;
  isLoadingHistorical: boolean;
  loadError: string | null;
};

export type GameStatisticsSummary = GameStatsLoadState & {
  gameId: string;
  primary: GamePrimaryMetrics | null;
  momentum: GameMomentumMetrics | null;
  impact: GameImpactMetrics | null;
  timeline: Array<{
    round: number;
    leaderIds: string[];
    scoreboard: Record<string, number>;
    events: Array<{ id: string; type: string; timestamp: string }>;
  }>;
};
```

## 6. Feature Requirements

- **Entry Points:**
  - From the post-game summary modal, provide a "View Detailed Game Stats" CTA that routes to the detailed view.
  - Add a route such as `/games/:gameId/statistics` accessible from history lists and shareable links.
- **Primary Metrics Card:** Show total rounds, duration, winning margin, and perfect bid count with contextual tooltips (e.g., margin breakdown).
- **Momentum Section:** Render a round-by-round heatmap for bid accuracy, a swing chart highlighting lead changes, and an MVP carousel for pivotal rounds.
- **Impact Section:** Display clutch performance callouts, trick efficiency distribution, and team contribution charts where applicable.
- **Event Timeline:**
  - Collapsible timeline that groups major events (dealer rotation, bid locks, trick sweeps) for narrative playback.
  - Allow jumping to a round to highlight associated charts.
- **Empty & Partial States:**
  - If the game is still in progress, display partial metrics with a banner noting live data and pending calculations.
  - For archived games missing enriched metadata, show skeletons and surface a migration banner until backfill completes.
- **Navigation & State Management:**
  - Use React Router/Next.js dynamic route segments consistent with existing navigation primitives.
  - Manage local UI state (tab selection, timeline filters) with component state; rely on selectors and cached queries for data.

## 7. Technical Plan

1. **Data Layer**
   - Add selector `selectGameStatistics(gameId)` that composes live reducer data with `GameRecord` archives when needed.
   - Reuse `listGames`, `getGame`, and `subscribeToGamesSignal` from `lib/state/io.ts` to hydrate game details and respond to cross-tab updates.
   - Normalize replayed event streams into round-scoped structures cached in-memory (`WeakMap<gameId, GameReplay>`).
   - Provide derived selectors for momentum and impact metrics, memoized on `(gameId, revision)`.
2. **Derivation Utilities**
   - Implement helpers such as `calculateLeadChanges`, `calculateRoundSwings`, `calculatePerfectBids`, and `calculateTrickEfficiency`.
   - Add unit tests covering edge cases: abandoned rounds, multiple winners, team vs solo modes.
   - Use deterministic ordering (timestamp + event id) when replaying event logs to keep charts stable.
3. **Components**
   - `GameStatisticsView` container orchestrates selectors, loading states, and error handling.
   - `GamePrimaryStatsCard`, `GameMomentumPanel`, `GameImpactPanel`, and `GameTimeline` components render derived data.
   - Shared chart utilities built atop `@visx/xychart`, `@visx/heatmap`, and `@visx/responsive` with theme tokens.
   - Introduce a `useGameStatistics(gameId)` hook that encapsulates the selector subscription, caching, and invalidation across tabs.
4. **State Integration**
   - Ensure active games push a snapshot into IndexedDB when they enter `summary` so analytics can render after refresh.
   - Persist replay caches in-memory per session; leverage `BroadcastChannel` to invalidate when archives change.
   - Gate expensive recomputations behind debounced selectors and only recompute affected segments (e.g., recompute round 7 when events for that round change).
5. **Routing/Navigation**
   - Register `/games/[gameId]/statistics` in the Next.js router; load data via `getStaticProps`-style client fetch that waits for selectors.
   - Update navigation menus/history lists to include a "Stats" pill or link next to each game.
   - Provide deep-link support with query params (e.g., `?round=5`) so the view can focus on a round or timeline entry on load.
6. **Testing**
   - Selector tests using fixture game bundles stored under `tests/fixtures/games`.
   - Component tests with mocked selectors ensuring loading, empty, error, and happy paths.
   - Visual regression baselines for charts/cards where tooling exists; otherwise snapshot DOM output.
   - Integration test that creates a game via reducer dispatch, archives it, and verifies selectors resolve expected metrics.

## 8. Non-Functional Considerations

- **Performance:** Memoize replay results per game and cache computed metrics in the hook; precompute summary fields at archive time to avoid heavy on-demand calculations.
- **Caching:** Persist lightweight summary caches (`GameSummaryCache`) in IndexedDB keyed by `gameId` to accelerate returning visitors; clear caches when `GameRecord.metadata.version` changes.
- **Localization:** Store metric labels and tooltips in shared i18n namespaces to match player statistics view.
- **Accessibility:** Ensure charts have ARIA descriptions, lead change indicators are distinguishable by colorblind-safe palettes, and timeline supports keyboard navigation.
- **Security:** Validate that the requested `gameId` belongs to the local profile; guard against tampered IndexedDB entries.
- **Error Handling:** Surface banners when IndexedDB is unavailable and provide a "retry" action that attempts to rehydrate via live reducer only.

## 9. Historical Data Backfill

1. **Expand Archived Summary Schema**
   - When archiving a game, persist additional fields (`roundLeaders`, `roundSwings`, `perfectBidEvents`, `timeline` entries) inside `GameRecord.summary`.
   - Add a `metadata.gameStatsVersion` field so clients can invalidate caches when the schema evolves.
2. **Backfill Existing Archives**
   - On startup, enqueue a background job that iterates over `GameRecord`s missing the new metadata.
   - Replay each bundle through the reducer to compute the enriched fields defined above.
   - Write updates back to IndexedDB in a single transaction per record, tagging them with the new version to avoid reprocessing.
3. **Telemetry & Guardrails**
   - Emit optional debug counters (via console or in-app diagnostics) for processed/backfilled/failed records.
   - Wrap the backfill in a feature flag so we can throttle rollout or disable when encountering corrupt archives.
4. **Post-Backfill Cleanup**
   - Simplify runtime selectors to rely on enriched summaries when available, falling back to replay only for older versions.
   - Document the schema contract in `docs/data-contracts.md` and update any tooling that exports/imports game bundles.
