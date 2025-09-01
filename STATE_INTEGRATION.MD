# Home View → Stateful Integration Plan

This document describes a low‑risk, incremental plan to migrate the default Home page (always‑visible 10 rounds + player scores) to the shared, event‑sourced state system while keeping the current layout and behavior intact at every step. Each step is followed by manual verification instructions and a commit/tagging convention so you can checkpoint and roll back easily.

References
- State model and events: `lib/state/types.ts`
- State adapter: `lib/state/instance.ts`, `components/state-provider.tsx`
- Current stateful rounds view (for event references): `components/views/RoundsView.tsx`


## Prerequisites

- Node 18.18+ (20+ recommended)
- Use local Next CLI via scripts: `pnpm dev`
- Start with branch: `merge-stateful-changes` (or your working branch)
- Recommended: close all open browser tabs except the one you test with


## Conventions

- Tag before starting: `git tag -a migrate-step-0-pre -m "Checkpoint before state migration (pre-step 1)"`
- Commit after each step with message prefix: `migrate(stepN): ...`
- Optional tag after each step: `git tag -a migrate-step-N -m "Step N complete"`
- Run locally for manual checks: `pnpm dev` → http://localhost:3000


## Step 1 — Read players from state (fallback to local)

Goal
- Render player names/initials from `state.players` when available, else fall back to the Home page’s local players. No change to bids, rounds, or interactions.

Change
- Import `useAppState()` in `app/page.tsx`
- Derive `statePlayers = Object.entries(state.players)` and map to view items
- Use `viewPlayers = statePlayers || localPlayers` for rendering and counts
- Keep existing layout and all local round/bid/made logic as‑is

Test
1) Run `pnpm dev`.
2) Visit `/settings` (stateful scoreboard). Add players (rename a couple for clarity).
3) Go back to `/`. Confirm the header initials now match state player names.
4) If no state players exist, `/` still shows the default 4 players.

Commit
- Example: `git commit -m "migrate(step1): read players from state with fallback; UI still uses local data for bids/rounds"`
- Optional tag: `git tag -a migrate-step-1 -m "Step 1 complete"`


## Step 2 — Compute running totals from state (fallback to local)

Goal
- When state players exist, compute per‑player running totals up to each round from `state.rounds` (only count rounds marked `scored`). Otherwise fall back to existing local totals.

Change
- Implement a state‑based `getRunningTotalFromState(playerId, upToRound)` using `state.rounds[i].bids` and `state.rounds[i].made`.
- Use the state version whenever `statePlayers.length > 0`; otherwise use the existing local accumulation.

Test
1) In `/`, add some bids, mark complete, and finalize at least 2 rounds so totals exist in state.
2) Visit `/`. Confirm totals reflect finalized rounds from state for each player.
3) Reload the page. Confirm totals persist (stateful) and still match.

Commit
- Example: `git commit -m "migrate(step2): compute running totals from state when available; fallback to local"`
- Optional tag: `git tag -a migrate-step-2 -m "Step 2 complete"`


## Step 3 — Read round state/bids/made from state (display only)

Goal
- The Home page reads and displays round state (`locked/bidding/complete/scored`), bids, and made/missed values from `state.rounds` when available, while interactions still update local state. This de‑risks the switch by making reads stateful first.

Change
- For each round/row and each player cell, derive:
  - round state: `state.rounds[roundNo]?.state ?? 'locked'`
  - bid: `state.rounds[roundNo]?.bids[playerId] ?? 0`
  - made: `state.rounds[roundNo]?.made[playerId] ?? null`
- Keep local handlers for now (no writes to state yet).

Test
1) In `/`, change bids and marks; finalize a round. Return to `/`.
2) Confirm that `/` mirrors state: the same round state labels, bids, and made indicators.
3) Reload `/`. Confirm persisted view matches state.

Commit
- Example: `git commit -m "migrate(step3): read round state/bids/made from state; keep local handlers"`
- Optional tag: `git tag -a migrate-step-3 -m "Step 3 complete"`


## Step 4 — Wire bid +/- to events (writes)

Goal
- Replace the local bid increment/decrement handlers with calls to `append({ type: 'bid/set', ... })`.

Change
- `incrementBid(round, playerId)` → append `bid/set` with clamped value
- `decrementBid(round, playerId)` → append `bid/set` with clamped value

Test
1) On `/`, click +/−. Confirm the UI updates immediately (state provider re‑renders).
2) Reload `/`. Confirm bids persist.
3) Cross‑check `/` shows the same bids.

Commit
- Example: `git commit -m "migrate(step4): wire bid +/- to state events"`
- Optional tag: `git tag -a migrate-step-4 -m "Step 4 complete"`


## Step 5 — Wire made toggle to events (writes)

Goal
- Replace the local made/missed toggles with `append({ type: 'made/set', ... })`.

Change
- `handleMadeBidToggle(round, playerId, made)` → append `made/set` with boolean

Test
1) On `/`, mark made/missed for players in a round.
2) Reload and verify persistence. Confirm `/` reflects the same values.

Commit
- Example: `git commit -m "migrate(step5): wire made toggle to state events"`
- Optional tag: `git tag -a migrate-step-5 -m "Step 5 complete"`


## Step 6 — Wire round state cycle to events (writes)

Goal
- Replace the local round state machine on the Home page with event calls:
  - bidding → complete: `round/state-set`
  - complete → scored: `round/finalize` (only if all players marked)
  - scored → bidding: `round/state-set`

Change
- `cycleRoundState(round)` to mirror `components/views/RoundsView.tsx` behavior.

Test
1) On `/`, click round header cell to advance states:
   - Ensure locked does nothing.
   - Bidding → Complete.
   - After all players marked in Complete, next click finalizes → Scored.
   - Scored → Bidding.
2) Verify that finalizing a round unlocks the next round (state logic).
3) Totals reflect finalize results immediately and persist on reload.

Commit
- Example: `git commit -m "migrate(step6): wire round cycle to state events (state-set/finalize)"`
- Optional tag: `git tag -a migrate-step-6 -m "Step 6 complete"`


## Step 7 — Wire player add/rename/remove to events

Goal
- Replace local player add/rename/remove with `player/added`, `player/renamed`, `player/removed`.

Change
- Add: generate `id = uuid()` and append `player/added`.
- Rename: append `player/renamed`.
- Remove: append `player/removed`; verify rounds/scores cleanup in reducer.

Test
1) Add players from `/` and `/settings` and confirm they are consistent across routes.
2) Rename a player from `/` and confirm `/settings` reflects it.
3) Remove a player and confirm the player disappears across routes; check rounds data cleans as expected, no errors.
4) Reload and confirm persistence.

Commit
- Example: `git commit -m "migrate(step7): wire player add/rename/remove to state events"`
- Optional tag: `git tag -a migrate-step-7 -m "Step 7 complete"`


## Step 8 — Remove local fallbacks and dead code

Goal
- Drop remaining local mirrors and fallbacks now that the Home page is fully state‑backed.

Change
- Remove local `players`, `roundStates`, and `playerData` where no longer used.
- Keep the exact layout (avoid visual regressions).

Test
1) Comprehensive click‑through on `/`:
   - Add players, rename, remove.
   - Bids +/−.
   - Complete, finalize scoring; verify totals and next round unlock.
   - Toggle scored view details.
2) Reload: data persists across sessions.
3) Cross‑tab (optional): open two tabs, make changes in one, verify the other updates.

Commit
- Example: `git commit -m "migrate(step8): remove local fallbacks; Home is fully state-backed"`
- Optional tag: `git tag -a migrate-step-8 -m "Step 8 complete"`


## Validation Checklist (quick)

- Players
  - Names/initials match across `/`, `/settings`.
  - Add/rename/remove persists and reflects immediately.
- Rounds
  - 10 rounds always visible; no wrapping caused by column count.
  - Round state cycle works and persists.
  - Finalize unlocks next round.
- Bids / Made
  - +/- clamps to 0..tricks for each round.
  - Made/missed recorded; scored rounds show correct delta.
- Totals
  - Running totals correct up to each round.
  - Persist across reload.


## Rollback

- To revert a step: `git reset --hard <previous-tag-or-commit>`
- To abandon the migration: `git reset --hard migrate-step-0-pre`


## Notes & Known Issues

- Development: prefer `pnpm dev`. In restricted networks, `next/font/google` can block production builds; dev mode works fine.
- Static export: project is configured for static export in `next.config.mjs` (for GitHub Pages). Use a static server to preview `out/` if you build.
- Rounds grid: if you change the number of players, ensure grid columns remain `3rem + repeat(players, 1fr)` to avoid row wrapping.
