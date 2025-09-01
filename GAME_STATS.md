Game Statistics Implementation Plan

Owner: Staff Software Engineer
Status: Draft → Ready for implementation
Scope: Games > Details view (read-only analytics, no core game rules changed)

Goals
- Provide a clear post-game analytics view answering common questions:
  - Which player bid the most/least points overall?
  - Highest bid any player made in a single round.
  - Biggest single-round loss (by absolute value) and who suffered it.
  - Totals for the game: total points bid, hands won, hands lost.
  - Rounds where total bids exceeded available tricks (overbid) or fell short (underbid).
  - Game timing: start time, end time, total duration.
- Keep analytics fast, deterministic, and independent of UI state.
- Avoid DB migrations; compute from existing stored data (events + final state).

Non‑Goals
- Modifying scoring logic or round flow.
- Persisting analytics back into the archive (at least initially).
- Live/in-progress game analytics (this plan targets archived game detail).

Data Sources
- Archived game record: `GameRecord` from `lib/state/io.ts`:
  - `bundle.events`: full event history with timestamps.
  - `summary.playersById`: player id → name mapping at game end.
  - `summary.scores`: final scores (sanity check only; not a source of truth per-round).
  - `createdAt` and `finishedAt`: timing metadata captured at archive time.
- Game logic helpers from `lib/state/logic.ts`:
  - `tricksForRound(roundNo)`; `roundDelta(bid, made)`.
- Final state derivable by reducing bundle (we already have a private `reduceBundle` helper in `io.ts`).

Key Definitions
- Total bid by player: Sum of that player’s `bid` across all rounds (0..max tricks) in the archived game.
- Highest single bid: Max `bid` a player declared in any round, with tie-breaking by earliest occurrence.
- Biggest single-round loss: Max absolute loss from a single round where `made=false`, i.e. `loss = 5 + bid`.
- Total points bid (game): Sum of all players’ bids across all rounds.
- Hands won/lost: Count of `made=true` / `made=false` across all player-round pairs.
- Round over/under: Let `T = tricksForRound(r)` and `B = sum(bids[*] for r)`:
  - Over: `B > T`; Under: `B < T`; Exact: `B == T` (useful for “tension” stat, optional).
- Game timing: Start = first event timestamp; End = `finishedAt`; Duration = `End - Start`.

Public API (new module)
- File: `lib/analytics.ts`

```ts
export type PlayerAgg = {
  playerId: string
  name: string
  totalBid: number
  highestSingleBid: { round: number; bid: number } | null
  handsWon: number
  handsLost: number
  biggestSingleLoss: { round: number; loss: number; bid: number } | null
}

export type RoundAgg = {
  round: number
  tricks: number
  sumBids: number
  overUnder: 'over' | 'under' | 'exact'
}

export type GameTiming = {
  startedAt: number
  finishedAt: number
  durationMs: number
}

export type GameStats = {
  players: PlayerAgg[]
  rounds: RoundAgg[]
  totals: {
    totalPointsBid: number
    totalHandsWon: number
    totalHandsLost: number
  }
  leaders: {
    mostTotalBid: PlayerAgg | null
    leastTotalBid: PlayerAgg | null
    highestSingleBid: { playerId: string; name: string; round: number; bid: number } | null
    biggestSingleLoss: { playerId: string; name: string; round: number; loss: number; bid: number } | null
  }
  timing: GameTiming
}

export function analyzeGame(rec: GameRecord): GameStats
```

Architecture & Approach
- Pure analytics module: No side effects; consumes the archived `GameRecord` and returns `GameStats`.
- Compute from final state + events:
  - Use final state rounds/bids/made for correctness and simplicity.
  - Use events only for timing of `startedAt` (first event ts) if needed; otherwise `createdAt` is acceptable but first event is more precise.
- Avoid coupling to UI; keep types stable with semantic names.
- Performance: Data size is small (<= few hundred events). Single pass over rounds and players is O(rounds * players).

Detailed Implementation Steps
1) Add analytics module
   - Create `lib/analytics.ts` with `analyzeGame(rec: GameRecord): GameStats`.
   - Reconstruct final state (if needed) or trust `rec.bundle` to extract round-level data by reducing events using existing reducer from `lib/state/types.ts`.
     - Option A (preferred): Implement a local reducer call identical to `reduceBundle` using the public `reduce` and `INITIAL_STATE` exports to avoid tight-coupling to `io.ts` private helper.
   - Iterate rounds `1..ROUNDS_TOTAL` and for each player id in `state.players`:
     - Read `bid = state.rounds[r].bids[pid] ?? 0` and `made = state.rounds[r].made[pid] ?? null`.
     - Update per-player aggregations and per-round sums.
   - Track leaders while aggregating to avoid extra passes.

2) Metrics computation (single pass where possible)
   - Per-player:
     - `totalBid += bid`.
     - `highestSingleBid = max(existing.bid, bid)` with earliest round tie-break.
     - If `made === true` → `handsWon++`; if `made === false` → `handsLost++` and compute `loss = 5 + bid` for biggest loss.
   - Per-round:
     - `sumBids[r] += bid`; `tricks = tricksForRound(r)`; classify over/under/exact.
   - Totals:
     - Aggregate `totalPointsBid`, `totalHandsWon`, `totalHandsLost` from per-player sums.
   - Leaders summary:
     - `mostTotalBid`/`leastTotalBid` from player aggregates.
     - `highestSingleBid`: take max across players’ `highestSingleBid`.
     - `biggestSingleLoss`: take max loss across players.
   - Timing:
     - `startedAt = min(event.ts)` from `rec.bundle.events`.
     - `finishedAt = rec.finishedAt`.
     - `durationMs = finishedAt - startedAt`.

3) UI integration (Games > Details page)
   - File: `app/games/view/page.tsx`.
   - Load `GameRecord` (already implemented), then call `analyzeGame(game)`.
   - Render a new “Statistics” card below Final Scores with grouped sections (always visible, no toggles):
     - Leaders: Most/Least total bid, Highest single bid, Biggest single loss.
     - Totals: Total points bid, Hands won, Hands lost.
     - Rounds: Table listing round, tricks, sum of bids, status (Over/Under/Exact). Consider badges with color coding.
     - Timing: Started, Ended, Duration (humanized, e.g., 1h 12m 03s).
   - Show all implemented statistics by default; do not hide any metrics behind toggles.

4) UX & Presentation
   - Keep layout compact and scannable; prefer small tables and definition lists.
   - Use existing color tokens (e.g., emerald/red) for positive/negative accents.
   - Accessibility: ensure stats are readable with text alternatives; no data solely conveyed by color.
   - i18n: format numbers using locale-aware APIs; time displayed via `toLocaleString()` and a helper for durations.

5) Testing
   - Unit tests for `lib/analytics.ts` covering:
     - Edge cases: no players; players with all zero bids; all made/all missed; mixed results.
     - Ties: equal total bids; equal highest single bid; ensure tie-breaking rules are deterministic.
     - Over/Under detection for multiple rounds, including exact equality.
     - Timing calculation using synthetic event timestamps.
   - Snapshot tests of the stats object shape where helpful (avoid brittle UI snapshots).

6) Performance & Safety
   - Single-pass algorithms; avoid nested heavy loops beyond rounds×players.
   - Defend against missing or partial data (undefined rounds or players) by defaulting to zeros.
   - No network calls; no IndexedDB writes.

7) Rollout Plan
   - Ship analytics module and UI behind a minimal feature flag (optional local flag) or as default if low risk.
   - Verify with a few archived games; cross-check totals by quick manual calculations.
   - If desired later, we can persist `stats` into `GameRecord.summary.v2` on archive to speed load; today we compute on demand to avoid migrations.

Additional Metrics (future additions; always visible once implemented)
- Bid behavior
  - Average bid per round per player; standard deviation/variance of bids.
  - Zero bids ("nil") count and success rate (made when bid=0).
  - Per-round bid distribution histogram (small text summary).
- Outcome quality
  - Perfect rounds: players where `made=true` for max theoretical made count; game-wide perfect round count.
  - “Tension” rounds: rounds where `sumBids == tricks` (can correlate with close outcomes).
  - Lead changes: count of times the leading player changed (requires cumulative score reconstruction by round).
  - Biggest comeback: max deficit overcome by eventual winner (requires per-round cumulative scores per player).
- Pacing (from timestamps, if needed)
  - Time per round: estimate from first event affecting the round to when that round becomes `scored`.
  - Time in bidding vs scoring phases.

Edge Cases
- Archived game with no events: Show “No data”.
- Players added/removed mid-game: analytics use final state’s `players` and per-round data; removed players have no entries in later rounds.
- Incomplete rounds (not `scored`): Treat missing `made` as `null` → not counted in hands won/lost, but bids still count toward totals if present. For archived games we expect all scored, but code should be tolerant.
- Ties in leaders: pick earliest by `playerId` sort, or earliest round for single-round stats; surface that ties occurred via small note if we add UI affordance later.

Pseudocode (core loop)
```ts
import { INITIAL_STATE, reduce } from '@/lib/state/types'
import { tricksForRound } from '@/lib/state/logic'

export function analyzeGame(rec: GameRecord): GameStats {
  // Reconstruct final state
  let state = INITIAL_STATE
  for (const e of rec.bundle.events) state = reduce(state, e)

  const pids = Object.keys(state.players)
  const players: Record<string, PlayerAgg> = {}
  for (const pid of pids) {
    players[pid] = {
      playerId: pid,
      name: rec.summary.playersById[pid] ?? pid,
      totalBid: 0,
      highestSingleBid: null,
      handsWon: 0,
      handsLost: 0,
      biggestSingleLoss: null,
    }
  }

  const rounds: RoundAgg[] = []
  let totalPointsBid = 0
  let totalHandsWon = 0
  let totalHandsLost = 0

  for (let r = 1; r <= 10; r++) {
    const rd = state.rounds[r]
    if (!rd) continue
    const tricks = tricksForRound(r)
    let sumBids = 0
    for (const pid of pids) {
      const bid = rd.bids[pid] ?? 0
      const made = rd.made[pid]
      sumBids += bid
      const p = players[pid]
      p.totalBid += bid
      if (!p.highestSingleBid || bid > p.highestSingleBid.bid || (bid === p.highestSingleBid.bid && r < (p.highestSingleBid.round))) {
        p.highestSingleBid = { round: r, bid }
      }
      if (made === true) { p.handsWon++; totalHandsWon++ }
      else if (made === false) {
        p.handsLost++; totalHandsLost++
        const loss = 5 + bid
        if (!p.biggestSingleLoss || loss > p.biggestSingleLoss.loss) {
          p.biggestSingleLoss = { round: r, loss, bid }
        }
      }
    }
    totalPointsBid += sumBids
    const overUnder = sumBids > tricks ? 'over' : sumBids < tricks ? 'under' : 'exact'
    rounds.push({ round: r, tricks, sumBids, overUnder })
  }

  const playerAggs = Object.values(players)
  const mostTotalBid = playerAggs.reduce((a, b) => a && a.totalBid >= b.totalBid ? a : b, null as any)
  const leastTotalBid = playerAggs.reduce((a, b) => a && a.totalBid <= b.totalBid ? a : b, null as any)
  const highestSingleBid = playerAggs.reduce((acc, p) => {
    if (!p.highestSingleBid) return acc
    const cur = { playerId: p.playerId, name: p.name, ...p.highestSingleBid }
    if (!acc) return cur
    if (cur.bid > acc.bid || (cur.bid === acc.bid && cur.round < acc.round)) return cur
    return acc
  }, null as any)
  const biggestSingleLoss = playerAggs.reduce((acc, p) => {
    if (!p.biggestSingleLoss) return acc
    const cur = { playerId: p.playerId, name: p.name, ...p.biggestSingleLoss }
    if (!acc) return cur
    if (cur.loss > acc.loss || (cur.loss === acc.loss && cur.round < acc.round)) return cur
    return acc
  }, null as any)

  const startedAt = rec.bundle.events.length ? Number(rec.bundle.events[0].ts) : rec.createdAt
  const finishedAt = rec.finishedAt
  return {
    players: playerAggs,
    rounds,
    totals: { totalPointsBid, totalHandsWon, totalHandsLost },
    leaders: { mostTotalBid, leastTotalBid, highestSingleBid, biggestSingleLoss },
    timing: { startedAt, finishedAt, durationMs: Math.max(0, finishedAt - startedAt) },
  }
}
```

Open Questions / Decisions
- Leaders tie display: Do we want to show multiple names when tied? (Default: single winner with deterministic tie-break.)
- Include “exact” rounds in the main list? (Yes; useful context.)
- Persist computed stats into `GameRecord.summary` v2 on archive for faster loading? (Defer until needed.)

Work Breakdown & Estimates
- Analytics module and tests: 4–6 hours.
- UI integration and styling: 2–4 hours.
- Additional metrics: 2–4 hours.
- Polish, docs, and review: 1–2 hours.

Risks & Mitigations
- Ambiguity in terms (e.g., “most points” could be read as scoring points vs bid points); mitigate with clear labels and hover help.
- Data anomalies (incomplete rounds): guard with defaults and surface counts transparently.
- Time precision: `finishedAt` is reliable; `startedAt` based on first event ts may differ slightly from `createdAt`—document behavior.

Acceptance Criteria
- Games > Details page renders a Statistics section with leaders, totals, rounds over/under, and timing.
- Numbers match manual calculations on a sample archived game.
- No runtime errors on empty or minimal game data.
