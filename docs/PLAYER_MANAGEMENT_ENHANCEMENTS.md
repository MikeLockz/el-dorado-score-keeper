# Player Management Enhancements

## Overview

This update promotes players and rosters to first-class, recoverable resources that deliver a richer management experience on the Players page. The UI now presents a unified "Players" panel with archive awareness, type toggles, auto-create helpers, and drag-and-drop ordering, along with a "Rosters" panel that enables snapshotting lineups and loading them into Score Card or Single Player modes.

## Data Model Updates

- Introduced `state.playerDetails` to track name, type (`human` or `bot`), timestamps, and archive status for every player ID.
- Extended roster records with `playerTypesById` and `archivedAt` so a roster preserves player metadata independently of legacy scorecard state.
- Added new event payloads:
  - `player/type-set`, `player/restored`
  - `roster/player/type-set`, `roster/archived`, `roster/restored`
  - Optional `type` attribute on `player/added` and `roster/player/added`
- Reducers delegate to `lib/roster/ops` which now understands player types, archival state, and default initialisation of the new fields.
- Helpers such as `hasScorecardProgress`, `selectArchivedPlayers`, and `selectAllRosters` expose the richer state to consumers.

## UI Behaviour

### Players Section

- Header exposes quick actions to add a single player or archive the current list.
- Drag-and-drop reordering mirrors the prior behaviour but surfaces player type and quickly accessible rename/remove actions.
- Type toggles flip between human and bot using the new `player/type-set` event.
- Auto-create helper synthesises the requested number of players (2–6) without violating the global maximum of 10.
- Archived players collapse by default; each entry shows archived timestamp and restores in a single click.

### Rosters Section

- Supports creation, renaming, archiving, and restoration of roster templates.
- Displays player counts and the ordered list of names, keeping player types intact.
- "Load Score Card" runs the shared `useNewGameRequest` flow so in-progress games remain safe, then replaces the active scorecard lineup using roster player IDs/names/types.
- "Load Single Player" rehydrates (or creates) a dedicated single-player roster, enforcing a maximum of six seats, and activates it for the solo engine.
- Auto-create button seeds a four-player default roster to jump-start new setups.
- Archived rosters are hidden by default and can be restored without manual re-entry.

### Edge Cases & Constraints

- Score Card loading enforces the 2–10 player bounds; Single Player loading enforces 2–6 players.
- Name collisions are prevented across active and archived players to avoid ambiguous identities during restore.
- Player removals soft-archive the detail record so history and roster snapshots remain recoverable.

## Accessibility & Responsiveness

- All actionable controls are accessible via keyboard, including drag handles (grabbable divs with `aria-grabbed`).
- Loading spinners and disabled states communicate background work when multi-event batches execute.
- Layout adapts to mobile and desktop widths, ensuring control groups wrap without overlap.

## Testing

- Updated unit suites cover the new event schemas, reducer branches for player metadata, and roster archival/type changes.
- UI tests for the landing page were refreshed to validate the dynamic hero cards and richer "Recent games" table.
- Additional selectors and helpers include targeted unit coverage to catch regressions in type propagation.

These changes establish flexible, auditable player management primitives that future features (like roster sharing or bot presets) can build upon.
