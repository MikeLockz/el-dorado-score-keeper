# Player Statistics Feature Plan

## 1. Context
- Build a player-specific history view that summarizes past performance using data already tracked in the state tree (players, playerDetails, rounds, scores, roundTallies, etc.).
- The view should be derivable from persisted/game session state without requiring server calls.
- Initial scope focuses on single player history; extendable to roster-based or multi-player histories later.

## 2. User & Business Goals
- **Primary user goal:** Let a player quickly understand their long-term performance (how often they play, how often they win, and whether they are improving).
- **Supporting goals:**
  - Surface detailed per-round bidding accuracy to improve strategy.
  - Provide fun facts (highest score, frequent suit) that encourage continued play.
  - Maintain parity between human and bot statistics when data exists.

## 3. Data Inputs & Normalization
- **Games collection (IndexedDB):** Archived games live in the IndexedDB `app-games-db` database under the `games` store (see `lib/state/io.ts`). Each `GameRecord` contains a `bundle.events` array that includes granular single-player events such as `sp/deal`, `sp/trick/played`, `sp/trick/cleared`, and `sp/round-tally-set`.
- **State snapshot:** Active game state (in-memory Redux slice) still drives immediate UI, but historical calculations must hydrate from `GameRecord` bundles.
- **Event log (current game):** The live IndexedDB `app-db` database (see `lib/state/io.ts`) retains the canonical `events` object store. The active session reducer already consumes these events; analytics replay can pull directly from the in-memory reducer context or refetch via `exportBundle` when necessary.
- **Current state gaps:** If the current store only holds the *active* game, add persistence (e.g., append completed game snapshots to a `completedGames` slice) or reuse the archived `GameRecord` retrieval helpers (`listGames`, `getGame`).
- **Normalization:**
  - Convert timestamps (e.g., `createdAt`) to JS `Date` objects when needed for display.
  - Ensure round data is ordered numerically (1-10) for per-round charts.
  - Derive per-hand data by replaying `sp/trick/played` events per player; fall back to live `state.sp.trickPlays` only when the IndexedDB bundle is unavailable.

## 4. Metric Definitions
### 4.1 Primary Metrics
| Metric | Definition | Calculation | Current Game Source | Archived Games Source |
| --- | --- | --- | --- | --- |
| Total Games Played | Number of completed games a player participated in | Count of games where player id exists in roster and game state `phase === "complete"` | Live state does not track completed-count; treat active game as +1 once phase reaches `summary` | Count `GameRecord` entries from IndexedDB `games` store filtered by player roster participation |
| Total Games Won | Completed games where player achieved top score (with tiebreak rules) | Count of games where player's final score equals highest score and no tie-breaking rules exclude them | Determine winner of active game when `state.sp.phase === 'summary'` or `scores` finalized | Use `GameRecord.summary` winner fields; replay score events if tie-breaking needed |
| Game Win Rate | Win rate as a percentage | `(Total Games Won / Total Games Played) * 100` (handle divide-by-zero) | Combine active game outcome (if finished) with archived totals before dividing | Derived from archived totals + active game outcome |

### 4.2 Secondary Metrics
| Metric | Definition | Calculation | Current Game Source | Archived Games Source |
| --- | --- | --- | --- | --- |
| Avg Score/Game | Average final score across completed games | `sum(finalScore) / totalGamesPlayed` | Use `state.scores[playerId]` when phase >= `summary` | Use `GameRecord.summary.scores[playerId]` aggregated across records |
| Highest Score | Peak final score in any completed game | `max(finalScore)` | Compare active game `state.scores[playerId]` once finished | Max of `GameRecord.summary.scores[playerId]` |
| Lowest Score | Minimum final score in any completed game | `min(finalScore)` | Compare active game `state.scores[playerId]` once finished | Min of `GameRecord.summary.scores[playerId]` |

### 4.3 Tertiary Metrics: Round-Level
| Metric | Definition | Calculation | Current Game Source | Archived Games Source |
| --- | --- | --- | --- | --- |
| Avg Bids per Game | Average number of bids placed (round entries) per game | Sum of bids per game / total games | Pull bids from `state.rounds[roundNo].bids[playerId]` for active rounds | Replay `GameRecord.bundle.events` (`bid/set`) grouped per game |
| Highest Bid | Maximum bid the player placed in any round | `max(bid)` | Max over active game `state.rounds[roundNo].bids[playerId]` | Max from archived `bid/set` events |
| Lowest Bid | Minimum bid the player placed in any round | `min(bid)` | Min over active game `state.rounds[roundNo].bids[playerId]` | Min from archived `bid/set` events |
| Bid Accuracy by Round | % of rounds (1-10) where bid == tricks taken | For each round number `r`: `matchingRounds[r] / totalRoundsPlayed[r]` | Compare live bids vs. `state.sp.roundTallies[r][playerId]` | Compare archived `bid/set` vs `sp/round-tally-set` events per round |

### 4.4 Tertiary Metrics: Hand-Level
| Metric | Definition | Calculation | Current Game Source | Archived Games Source |
| --- | --- | --- | --- | --- |
| Hands Played | Total tricks the player participated in across all games | Counts of trick participation (using `trickCounts` snapshots or derived from `sp/trick/played` events) | Use `state.sp.trickCounts[playerId]` and live `trickPlays` | Replay `sp/trick/played` events per game from `GameRecord.bundle.events` |
| Most Frequent Suit | Suit the player played most often across recorded hands | Aggregate suits from trick plays grouped by player; determine mode | Count suits from active `state.sp.trickPlays` | Aggregate suit counts from archived `sp/trick/played` events |

### 4.5 Advanced Performance Metrics
| Metric Group | Metric | Definition | Calculation | Current Game Source | Archived Games Source |
| --- | --- | --- | --- | --- | --- |
| Trick Efficiency | Avg Trick Delta | Average difference between tricks won and bid amount (positive = overtricks, negative = undertricks) | `sum(trickCount - bid) / totalRoundsPlayed` | Live bids from `state.rounds` plus `state.sp.roundTallies` | Replay `sp/round-tally-set` and `bid/set` events per game |
| Trick Efficiency | Perfect Bid Streak | Longest consecutive streak of rounds where bid exactly matched tricks taken | Scan ordered rounds per game; track maximum run of exact matches | Evaluate streak using live rounds and tallies | Evaluate streak across archived rounds via replayed events |
| Suit Mastery | Trump Win Rate | Win percentage of games when a given suit was trump | For each suit: wins where `trump === suit` / games played with that suit as trump | Use current game `state.sp.trump` and outcome when finished | Replay `sp/deal` to get trump per game; combine with archived outcomes |
| Suit Mastery | Suit Trick Success | Average tricks won when a suit was trump vs. off-trump suits | Aggregate tricks by suit context; compute averages | Use live `state.sp.trickPlays` with `state.sp.trump` context | Replay `sp/trick/played` with trump info from `sp/deal` |
| Score Volatility | Score Standard Deviation | Variation of final scores across games | `stddev(finalScores)` per player | Active game's final score from `state.scores[playerId]` | Historical final scores from `GameRecord.summary.scores[playerId]` |
| Score Volatility | Largest Comeback/Lead Blown | Max difference between midpoint deficit and final win (comeback) or lead surrendered | Use per-round cumulative scores to track swings | Replay live `score/added` events (pulled from in-memory event journal or `exportBundle`) | Replay archived `score/added` events to build cumulative score timeline |
| Momentum | Rolling Avg Score | Moving average of final scores over last N games (configurable window) | Compute sliding window mean (default N=5) | Include active game score when phase >= `summary` | Order archived scores by `GameRecord.finishedAt` |
| Momentum | Win Streak | Longest and current consecutive wins | Iterate chronological results; track max/current streak | Combine active game win (if finished) with historical streak state | Traverse archived `GameRecord.summary.winnerId` values chronologically |

### 4.6 Selector Contracts
```ts
export type PlayerStatsLoadState = {
  isLoadingLive: boolean;
  isLoadingHistorical: boolean;
  loadError: string | null;
};

export type PrimaryMetrics = {
  totalGamesPlayed: number;
  totalGamesWon: number;
  winRatePercent: number;
};

export type SecondaryMetrics = {
  averageScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
};

export type RoundMetric = {
  roundNo: number;
  bidCount: number;
  bids: number[];
  highestBid: number | null;
  lowestBid: number | null;
  accuracyPercent: number | null;
  accuracyMatches: number;
  accuracyTotal: number;
};

export type HandInsight = {
  handsPlayed: number;
  suitCounts: Record<'clubs' | 'diamonds' | 'hearts' | 'spades', number>;
  topSuit: 'clubs' | 'diamonds' | 'hearts' | 'spades' | null;
};

export type AdvancedMetrics = {
  trickEfficiency: {
    averageDelta: number | null;
    perfectBidStreak: number;
  };
  suitMastery: {
    trumpWinRateBySuit: Record<'clubs' | 'diamonds' | 'hearts' | 'spades', number>;
    trickSuccessBySuit: Record<'clubs' | 'diamonds' | 'hearts' | 'spades', number>;
  };
  scoreVolatility: {
    standardDeviation: number | null;
    largestComeback: number | null;
    largestLeadBlown: number | null;
  };
  momentum: {
    rollingAverageScores: Array<{ gameId: string; score: number; average: number }>;
    currentWinStreak: number;
    longestWinStreak: number;
  };
};

export type PlayerStatisticsSummary = PlayerStatsLoadState & {
  playerId: string;
  primary: PrimaryMetrics | null;
  secondary: SecondaryMetrics | null;
  rounds: RoundMetric[];
  handInsights: HandInsight | null;
  advanced: AdvancedMetrics | null;
};
```

## 5. Feature Requirements
- **Player Selector:**
  - Dropdown or search to choose a player from `playerDetails`.
  - Default to active human player if available.
- **Primary Stats Card:** Display total games played, games won, win rate with highlighting.
- **Secondary Stats Card:** Show average/highest/lowest scores with contextual tooltips.
- **Round Insights:**
  - Table or chart (10 columns) showing bid accuracy per round number.
  - Summary row for highest/lowest/avg bids.
- **Hand Insights:**
  - Show total hands played and frequent suit (with iconography).
  - Optional breakdown of suit distribution (bar chart or doughnut).
- **Advanced Analytics:**
  - Highlight trick efficiency deltas, perfect bid streaks, and momentum badges (current streak).
  - Provide suit mastery comparisons (per-trump win rate, trick success), volatility summaries, and sliding average charts.
- **Visualization Guidance:**
  - Use card-based layout for primary/secondary stats with concise labels and trend indicators.
  - Represent bid accuracy as a 10-column heatmap (rounds) with tooltip breakdowns.
  - Show trick efficiency and volatility as sparklines/line charts with contextual annotations; suit mastery via matrix or bar chart.
  - Maintain consistent color palette mapping (e.g., suits) and provide legends accessible to screen readers.
- **Empty States & Loading:**
  - Handle no completed games (show guidance to start playing).
  - Display skeleton loaders for each card/chart until both live and archived data are resolved.
- **Accessibility:**
  - Ensure cards meet color contrast; charts have aria descriptions.
  - Provide keyboard navigation for player selector and tabs.
- **Responsive Layout:**
  - Stack cards vertically on narrow screens; multi-column layout on desktop.
- **Component Styling:**
  - Build all cards using shared primitives in `components/ui` (`Card`, `CardHeader`, `CardContent`, `CardFooter`) to inherit design tokens.
  - Scope styling through new CSS modules that import existing spacing/typography mixins; avoid global overrides.
  - Use the app’s `Skeleton` component for loading states, matching shimmer/shapes to the final layout.
  - Leverage existing iconography (`CardGlyph`, suit icons) for suit visuals in hand insights.
  - Adopt `@visx/visx` primitives for charts: `@visx/heatmap` for bid accuracy grid, `@visx/xychart` for sparklines/rolling averages, and `@visx/shape` for suit distribution bars. Apply color tokens and add ARIA/tooltip layers manually.

## 6. Technical Plan
1. **Data Layer**
   - Add selector `selectCompletedGamesByPlayer(playerId)` that consolidates necessary metrics from state/persistence.
   - Create memoized selectors for each stat to avoid recomputation.
   - Normalize past game records into a canonical shape (e.g., `GameSummary` interface).
   - Hydrate archived game bundles from IndexedDB via `listGames`/`getGame` (`lib/state/io.ts`) and expose a decoded event stream (deal, trick, score events) per game.
   - Merge current game data from the Redux slice with archived aggregates in a unified selector response (e.g., `combineLiveAndHistoricalStats`).
   - Expose loading/error flags from selectors (e.g., `isLoadingHistorical`, `isLoadingLive`, `loadError`) so the view can toggle skeletons and fallbacks.
   - Return a strongly typed `PlayerStatisticsSummary` object that wraps metrics and load state (see Selector Contracts).
2. **Derivation Utilities**
   - Helper functions to compute aggregates (e.g., `calculateBidAccuracy(rounds, playerId)`).
   - Unit tests validating edge cases (no games, only partial rounds, ties).
   - Replay helpers that consume `GameRecord.bundle.events` to emit per-round/per-trick timelines for suit counts and hand participation.
   - Advanced calculators for trick deltas, streak detection, score volatility, suit-based performance, and rolling averages.
3. **Components**
   - `PlayerStatisticsView` container: fetches player id, loads stats, handles loading/empty states.
   - `PrimaryStatsCard`, `SecondaryStatsCard`, `RoundAccuracyChart`, `HandInsightsCard` for modular UI.
   - Shared chart component configured for 10-round accuracy visualization.
   - `AdvancedInsightsPanel` combining trend charts (rolling average), volatility sparkline, streak indicators, and suit mastery matrix.
   - Cross-tab sync hook that subscribes to `subscribeToGamesSignal` and triggers stat recomputation when games are added/deleted.
   - Typed selector responses (e.g., `PlayerStatsSummary`, `RoundMetric`, `SuitInsight`) exported from a `/types` module for UI consumption.
4. **State Integration**
   - Ensure completed games stored in a persistent slice (localStorage or backend) and rehydrated on load.
   - Trigger persistence when a game transitions to `summaryEnteredAt` or `phase === "complete"`.
   - Register IndexedDB/BroadcastChannel listeners (via `subscribeToGamesSignal`) so statistics recompute when another tab archives or deletes a game.
5. **Routing/Navigation**
   - Add dedicated route (e.g., `/players/:playerId/statistics`) or modal accessible from scoreboard.
   - Update navigation UI to expose the statistics view.
6. **Testing**
   - Selector unit tests with sample state (like provided snapshot).
   - Component tests ensuring correct rendering given mock selectors (including loading/error flag scenarios).
   - Visual regression tests for charts/cards if tooling available.

## 7. Non-Functional Considerations
- **Performance:** Memoize heavy aggregations; precompute summaries when storing completed games.
- **Performance Guardrails:** Cache parsed `GameRecord` event timelines keyed by `gameId`, batch IndexedDB reads, and debounce recomputations triggered by cross-tab signals.
- **Localization:** Keep metric labels in i18n files for future translation.
- **Persistence:** Consider schema migrations if storing history in localStorage/indexedDB.
- **Security:** Guard against tampered local data; sanitize strings.
- **Error Handling:** Detect IndexedDB unavailability (e.g., private mode) and show a degraded experience banner with instructions; fall back to live-state-only stats when archives can’t be read.

## 8. Open Questions
- Where do completed game summaries live today? Need confirmation on storage strategy (client-only vs. backend).
- Should bots appear in the player selector by default, or only human players?
- Are tie games counted as wins for all tied players or require a tiebreaker rule?
- Do we track per-trick play history beyond final state (needed for accurate hand suit distribution)?
- Is per-round cumulative scoring stored to compute volatility/comeback metrics, or do we need to derive it from logs?
- What window size should momentum calculations default to, and should users be able to adjust it?
- Can analytics for the active game read the live event stream directly, or should we re-export from the `events` store for consistency with archived replay logic?

## 9. Next Steps
1. Confirm data source for historical games and extend persistence if necessary.
2. Implement selectors/utilities and add test coverage.
3. Build UI components iteratively, starting with primary stats, then secondary, then charts.
4. Integrate navigation entry points and gather feedback from stakeholders.
5. Polish with animations/tooltips and finalize documentation.
