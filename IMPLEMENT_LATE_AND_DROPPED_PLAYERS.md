# Implementing Late Joins and Dropped Players

This plan turns the product spec in `LATE_AND_DROPPED_PLAYERS.md` into concrete, code-level steps for this codebase. It covers data changes, reducer and selector updates, UI behavior, tests, and how to manually validate.

Scope: allow players to join mid‑game, be dropped from future rounds without losing historical scores, and be re‑added later. Absent rounds show “–” and contribute 0 to totals.

## Current Architecture (quick map)
- State shape (`lib/state/types.ts`)
  - `players: Record<string, string>`
  - `scores: Record<string, number>`
  - `rounds: Record<number, { state: RoundState; bids: Record<id, number>; made: Record<id, boolean|null> }>`
  - Score aggregation is done in `finalizeRound` (`lib/state/logic.ts`).
  - Event‑sourced state via `reduce()` in `types.ts`; event helpers in `lib/state/events.ts`; payload validation in `lib/state/validation.ts`.
- Selectors (`lib/state/selectors.ts`)
  - Build round summaries, cumulative totals, leaders.
- UI
  - Grid in `components/views/CurrentGame.tsx`.
  - Player mgmt in `components/players/*`.

## High‑Level Design
- Represent participation per player per round.
- Keep existing `players` map intact when dropping; only toggle per‑round participation going forward.
- Late join backfills earlier rounds as absent so totals don’t change.
- Editing bids/made is disabled for absent cells. Absent cells render “–”.

## Data Model Changes
Minimal additive change to `RoundData`:
- Add `present?: Record<string, boolean>` where `true` means the player participates that round.
  - Defaults/assumptions:
    - If `present[pid] === false` ⇒ absent.
    - If missing (undefined), treated as present for compatibility unless explicitly set to `false` by reducer logic.
- No DB schema changes: all state is event‑reduced and snapshotted.

Files to change:
- `lib/state/types.ts` → update `RoundData`.
- `lib/state/validation.ts` → new events schema (below).
- `lib/state/events.ts` → event factories for new events.
- `lib/state/logic.ts` → `finalizeRound` respects presence.
- `lib/state/types.ts` → reducer updates for events and guards for bid/made when absent.
- `lib/state/selectors.ts` → ignore absent players for round rows, info, cumulative.

## Events
Add two new events (non‑breaking):
- `player/dropped`: `{ id: string; fromRound: number }`
- `player/resumed`: `{ id: string; fromRound: number }`

Keep existing events unchanged. Retain hard `player/removed` (full delete) for backwards compatibility and tests; the UI will prefer soft drop/resume going forward.

Late join behavior uses existing `player/added` and current state to infer join round.

## Reducer Changes (`lib/state/types.ts`)
1) Extend `RoundData` with `present?: Record<string, boolean>`.

2) `player/added`
- Add player to `players` (same as today).
- Compute join round as “first non‑scored round” (i.e., smallest r where `rounds[r].state !== 'scored'`; if none, they can only be a spectator and will be absent for all rounds).
- For each round `r`:
  - If `rounds[r].state === 'scored'` ⇒ set `present[id] = false` (absent historically).
  - Else ⇒ set `present[id] = true`.
- Do not set `bids/made` values here. They remain unset until user input.

3) `player/dropped { id, fromRound }`
- For each round `r >= fromRound`:
  - If `rounds[r].state === 'scored'` ⇒ unchanged.
  - Else ⇒ set `present[id] = false`, clear `bids[id]` and `made[id]`.
- Keep `players` and `scores` as is.

4) `player/resumed { id, fromRound }`
- For each round `r >= fromRound`:
  - If `rounds[r].state !== 'scored'` ⇒ set `present[id] = true`. (Do not backfill historical rounds.)

5) Guard inputs when absent
- In `bid/set` and `made/set` cases, if `rounds[round].present?.[playerId] === false`, ignore the event (return state unchanged).

6) `finalizeRound` (in `lib/state/logic.ts`)
- When computing scores, only add deltas for players with `present?.[id] !== false`.
- Absent players contribute 0 in that round.

## Selector Changes (`lib/state/selectors.ts`)
Apply presence to UI and aggregates:
- `selectRoundSummary(s, r)`
  - For each player, if `present?.[id] === false` ⇒ return `bid=0`, `made=null`, `delta=0` for display.
- `selectRoundInfo(s, r)` and `selectRoundInfosAll`
  - Sum bids only for present players in that round.
- `selectCumulativeScoresThrough` and `selectCumulativeScoresAllRounds`
  - Add deltas only if present in that round.

Note: handle `present` undefined as “present” for backwards compatibility with old snapshots.

## UI Changes
1) Grid (`components/views/CurrentGame.tsx`)
- Compute `isAbsent = state.rounds[r]?.present?.[pid] === false`.
- When `isAbsent`:
  - Render “–” for both bid and made/score areas.
  - Disable all bid and made inputs (don’t render the controls).

2) Players screen (`components/players/PlayerList.tsx`)
- Replace hard remove with soft drop:
  - Action: “Drop from current round” triggers `player/dropped` with `fromRound = next actionable round`.
  - Expose a “Re‑add” action for players that are dropped in the next actionable/future rounds: triggers `player/resumed` with `fromRound` set to current.
- Keep hard remove only when no rounds have started (optional) or hide it entirely.

3) Create player (`components/players/CreatePlayer.tsx`)
- Keep using `player/added`.
- Reducer will infer late join automatically (absent for scored rounds, present for current/future rounds).

Helper for UI: add a tiny selector utility (or inline logic) to get the “next actionable round” (already available as `selectNextActionableRound`). Use that for `fromRound`.

## Validation (`lib/state/validation.ts`)
- Add payload schemas:
  - `player/dropped`: `{ id: string, fromRound: number }`
  - `player/resumed`: `{ id: string, fromRound: number }`

## Events API (`lib/state/events.ts`)
- Add factories `playerDropped` and `playerResumed` mapping to the new types.

## Edge Cases to Handle
- Adding after all rounds scored ⇒ player is absent for all rounds; totals stay 0.
- Dropping in a round that is currently `bidding` or `complete` ⇒ clear bid/made for that round and mark absent.
- Finalized (scored) rounds must never be altered by drop/resume.
- Bid/made set attempts for absent players are ignored by reducer.

## Step‑By‑Step Implementation
1) Types and events
   - Update `RoundData` type with optional `present` map.
   - Add event types to `EventMap` and payload schemas in `validation.ts`.
   - Add event factories in `events.ts`.

2) Reducer changes
   - Update `reduce` handler for `player/added` to set per‑round presence (absent for scored rounds; present otherwise).
   - Implement `player/dropped` and `player/resumed` logic as above.
   - Guard `bid/set` and `made/set` if absent.

3) Scoring
   - Modify `finalizeRound` to sum only present players for the round.

4) Selectors
   - Apply presence rules to round rows, round info (sumBids), and cumulative totals.

5) UI
   - In `CurrentGame.tsx`, render and disable inputs when absent.
   - In `PlayerList.tsx`, wire soft drop/resume actions using `selectNextActionableRound` to pick `fromRound`.
   - Optionally hide or restrict hard delete.

6) Docs
   - Keep `LATE_AND_DROPPED_PLAYERS.md` as spec; this document serves as dev impl guide.

## Testing Strategy
Use Vitest. Focus on reducer, selectors, and a couple integration scenarios. Add new tests; don’t break existing ones.

Unit tests (add under `tests/unit/`):
- `reducers-late-join.test.ts`
  - Setup: score some rounds for two players; add a third via `player/added`.
  - Expect: earlier scored rounds have `present=false` for the new player (implicitly via behavior), totals unchanged, current/future rounds have `present=true`.
  - Expect: `finalizeRound` ignores absent player in scored rounds and includes them going forward.

- `reducers-drop-resume.test.ts`
  - Setup: three players; drop P2 from next actionable round; set some bids for all; finalize; resume later.
  - Expect: P2 is absent (present=false) for dropped span; no bid/made persisted for those rounds; totals accumulate only when present.
  - Guard: attempts to `bid/set` or `made/set` for P2 when absent are ignored.

- `selectors-presence.test.ts`
  - `selectRoundSummary` returns “–” semantics via `made=null` and `delta=0` for absent players.
  - `selectRoundInfo` sums only present players’ bids.
  - `selectCumulativeScoresAllRounds` includes deltas only for present players.

Integration tests (add under `tests/integration/`):
- `late-join-ui.test.ts`
  - Simulate: add two players; play and score round 1; add P3.
  - Expect: prior rounds show “–” for P3; editing disabled on those cells; totals unaffected; presence persists across rehydrate (`initInstance` reopen).

- `drop-resume-ui.test.ts`
  - Simulate: P2 dropped from round N; ensure P2’s future cells show “–”, editing disabled, totals frozen; resume at round N+k restores editing and accumulation; verify broadcast sync between two instances.

Note: Keep `tests/integration/player-remove.test.ts` intact; we are not removing hard delete semantics, only de‑emphasizing in UI.

## Manual Validation
Run locally and exercise the flows end‑to‑end.

Prep
- `pnpm install`
- `pnpm test` (ensure baseline green)
- `pnpm dev` and open the app

Scenarios
1) Late join
   - Create two players A, B. Bid/complete round 1; finalize.
   - Add player C.
   - Verify: in round 1, C shows “–/–” and contributes 0 to totals; in current round, C can bid and be scored.

2) Drop
   - With A, B, C active, click “Drop” on C.
   - Verify: from the current round onward (until resumed), C’s cells render “–”; inputs disabled; previous scored rounds unchanged; C remains in leaderboard with current total.

3) Resume
   - Click “Re‑add” for C.
   - Verify: C’s cells from the resume round become editable; totals update going forward.

4) Persistence and multi‑tab
   - Refresh the page; state persists with correct absent spans.
   - Open a second tab; perform drop/resume in one tab; verify the other tab reflects changes.

5) Edge conditions
   - Add a player after all rounds are scored; verify they are absent everywhere and totals remain 0.
   - Attempt to interact with an absent cell (should be disabled) and ensure no errors occur.

## Risks and Mitigations
- Backwards compatibility: treat missing `present` as “present”; keep `player/removed` intact for old tests/workflows.
- Performance: `present` checks are O(1) lookups; selector loops already iterate players, so the extra check is negligible.
- UX clarity: keep column order stable; show clear drop/re‑add affordances in Players screen.

## Rollout Checklist
- Implement reducer, logic, selectors, and UI changes.
- Add unit and integration tests; update docs.
- Validate manually with scenarios above.
- Merge; monitor; optionally feature‑flag the new UI controls if needed.

