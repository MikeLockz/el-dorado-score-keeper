# Late Joins and Dropped Players — Implementation Plan

This plan updates game rules, player tracking, and scoring so players can join mid‑game and be dropped and re‑added multiple times. 

## Goals and Rules
- Late join: A player may join at any round. Prior rounds do not count against them; those rounds have no bids or scores. The player starts from 0 in the round they join.
- Drop/remove: A player may be removed at any time. Their completed rounds remain visible with existing bids and scores; future rounds have no bids. Their total score continues to display in future rounds.
- Multiple joins/leaves: Players can be dropped and later re‑added any number of times. Rounds between participation windows show “–” with zero contribution. No explicit single‑round removal exists; a one‑round gap is accomplished via drop then re‑add next round.
- Score fairness: Rounds with no participation (pre‑join or during dropped intervals) must not affect totals; only played rounds impact totals.

## Terminology
- Participate: Player is present for a round and can bid/score.
- Absent: Player is not participating in a round due to being pre‑join or currently dropped; bid and score are “–” and delta = 0.
- Dropped: Player is removed from participation starting at a given round until re‑added; visually persists with future “–” and a stable total.
- Late Join: Player begins participating at a specific round; earlier rounds show “–” with delta = 0.

## Data Model Changes
Use your project’s storage scheme (in‑memory, local storage, DB). The intent applies across implementations.

- Player
  - id, name (unchanged)
  - optional: `display_order` for column ordering stability

- Round
  - id, index (0‑based), status (e.g., pending | active | complete) — unchanged unless not present

- PlayerRound (per player per round)
  - `playerId`, `roundId`
  - `participation`: enum {'present','absent'} — default 'present'
  - `absenceReason`: enum {'late_join','dropped'} | null
  - `bid`: number | null (null when absent)
  - `scoreDelta`: number (0 when absent)
  - optional: `locked`: boolean to prevent edits after round completion

Migration/backfill: For existing data, set `participation='present'`, `absenceReason=null`, keep existing `bid` and `scoreDelta`.

## Core Logic Updates
- Create player mid‑game
  - Add player entity.
  - For rounds with index < joinIndex: create PlayerRound rows with `participation='absent'`, `absenceReason='late_join'`, `bid=null`, `scoreDelta=0`.
  - For joinIndex and all future rounds: initialize PlayerRound rows with `participation='present'`, `bid=null` initially, and compute `scoreDelta` as usual once scored.

- Drop player (from a round onward)
  - For current and all future rounds with index >= dropIndex that are not yet completed: set `participation='absent'`, `absenceReason='dropped'`, clear `bid` to null, set `scoreDelta=0`.
  - Do not alter any completed rounds <= last completed round before drop.
  - Keep the player visible in the scorecard; totals remain the sum of played rounds.

- Re‑add/resume player after drop
  - At `resumeIndex`: for that round and future rounds, set/initialize `participation='present'` (unless a round is already finalized, which remains unchanged).
  - Any rounds between `dropIndex` and `resumeIndex` are absent with “–” and delta = 0.
  - Re‑adding can happen multiple times across the game; reuse the same player id.

- Mid‑round changes
  - If a player is dropped during an in‑progress round (before scoring is finalized), treat that round as absent: clear bid, set delta=0, mark `absenceReason='dropped'`.
  - If the round is already finalized, the drop applies to subsequent rounds only.
  - A one‑round skip is achieved by dropping before that round is finalized and resuming at the next round.

- Scoring aggregation
  - Total score for a player = sum of `scoreDelta` for rounds where `participation='present'`.
  - Absent rounds (late join or dropped) contribute 0 and show “–” for bid and score cell.

## UI/UX Changes
- Add player mid‑game
  - Provide “Add Player” control during any in‑progress or pending round in the Players view.
  - On add, use existing player input; set join round = current active round index.
  - Backfill prior rounds with “–” placeholders; keep column order stable (e.g., append to right or configurable ordering).

- Drop and re‑add player
  - Controls:
    - Use existing Delete trash icon on Player view (removes participation starting the current round)
      - Player will remain visible in the Player list but will have a + button to re-add them instead of trash can.
    - “Re‑add player” (available for dropped players on later rounds)
  - Visuals:
    - In the score grid, absent cells display “–” for bid and score; total remains visible in header/footer for the player.

- Scorecard behavior
  - Users cannot enter bids/results for absent rounds.
    - The input UI for the Bid and Complete forms per player cell should be disabled when `participation='absent'`.
  - Participation changes only affect unfinalized or future rounds.
  - Sorting/leaderboard includes dropped players with their final totals

## Validation and Constraints
- Consistency: whenever `participation='absent'`, enforce `bid=null` and `scoreDelta=0`.
- Join/resume index must be >= current active round when applying

## Persistence and Migration
- Schema/data migration
  - Add `participation` and `absenceReason` to per‑round records.
  - Backfill existing rows to `present` with current `bid`/`scoreDelta`.
  - Ensure indices `(playerId, roundId)` are unique.

- Backward compatibility
  - If legacy code assumes `bid` is always a number, guard nulls in UI and calculations.
  - If legacy totals iterate raw rounds, filter by `participation==='present'`.

## API/Store Updates
- Actions/endpoints
  - `addPlayerAtRound(name, joinIndex)` → creates player + PlayerRound rows as specified for a new player.
  - `dropPlayerFromRound(playerId, dropIndex)` → marks absent for all >= dropIndex (unless already completed/frozen).
  - `resumePlayerAtRound(playerId, resumeIndex)` → marks present for >= resumeIndex (future/unfinalized rounds), enabling multiple re‑joins.
  - `setBid(playerId, roundId, bid)` and `finalizeScore(...)` must reject entries when `participation='absent'`.

- Queries/selectors
  - `getPlayerTotals()` sums only `present` rounds.
  - `getRoundParticipants(roundId)` filters to `present` for bid entry UI.
  - `getScoreCell(playerId, roundId)` returns { kind: 'absent' | 'present', bid, delta } for rendering “–” vs values.

## Calculations and Edge Cases
- Adding after multiple completed rounds keeps earlier rounds absent and total at 0 until play begins.
- Dropping after placing a bid but before round finalization keeps the bid and determines the score for that round.
- Dropping after round finalization does not modify that round; absence applies to subsequent rounds.
- Tie‑breaking and winner logic should include dropped players’ final totals

## Testing Plan
- Unit tests
  - Late join backfills prior rounds as absent and totals = 0.
  - Drop then resume next round yields a single absent round with “–” and unchanged total.
  - Drop from round N onward marks future rounds absent; totals frozen; completed rounds unaffected.
  - Prevent bid/score entry on absent rounds.
  - Totals sum only `present` rounds.

- Integration/UI tests
  - Add player mid‑game and verify rendering of “–” in prior rounds.
  - Drop and re‑add across multiple intervals; verify correct absent spans and totals.
  - Drop a player and verify persistent column with future “–” and stable total.

## Rollout Steps
1. Implement data model additions and migrations.
2. Update selectors and calculations to respect `participation` state.
3. Update UI to render “–” and block inputs for absent rounds.
4. Add actions/endpoints for add/drop/resume flows.
5. Backfill existing games and manually verify a few scenarios.
6. Ship behind a small feature flag if desired; remove flag after validation.

## Developer Notes
- Represent “–” only at the view layer; persist as `bid=null` and `scoreDelta=0` with `participation='absent'`.
- Favor a single `participation` flag over implicit checks (e.g., `bid===null`) to avoid ambiguity.
- Keep column order stable to reduce cognitive load when players join/drop.
- Consider a light audit trail on participation changes for debugging (who changed, when, reason).
