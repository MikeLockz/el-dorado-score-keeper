## Rosters: Mode-Scoped Player Management

This document describes the roster model introduced to decouple Score Card players from Single Player (SP) rosters. It captures the data model, events, selectors, guardrails, and migration notes.

—

## Model

- `AppState.rosters: Record<UUID, Roster>`
  - `Roster = { name, playersById, displayOrder, type, createdAt }`
  - `type: 'scorecard' | 'single'`
- Active pointers
  - `activeScorecardRosterId: UUID | null`
  - `activeSingleRosterId: UUID | null`
- Legacy fields remain for backward compatibility
  - `players: Record<string,string>`, `display_order: Record<string,number>`

—

## Events (roster/\*)

- `roster/created { rosterId, name, type }`
- `roster/renamed { rosterId, name }`
- `roster/activated { rosterId, mode: 'scorecard' | 'single' }`
- `roster/player/added { rosterId, id, name }`
- `roster/player/renamed { rosterId, id, name }`
- `roster/player/removed { rosterId, id }`
- `roster/players/reordered { rosterId, order: string[] }`
- `roster/reset { rosterId }`

Reducers delegate to `lib/roster/ops.ts` (pure operations) for maintainability and testing.

—

## Selectors

- `selectActiveRoster(mode)` → `{ rosterId, name, playersById, displayOrder } | null`
- `selectPlayersOrderedFor(mode)` → `Array<{ id, name }>`
- `selectHumanIdFor('single')` → `string | null` (view-only human marker)
- Legacy `selectPlayersOrdered` remains for Score Card UI and tests.

—

## Guardrails

- `addPlayer` enforces: max 10, non-empty names, unique (case-insensitive)
- `removePlayer` enforces: min 2 players
- `renamePlayer` enforces: non-empty and unique
- Undo/redo (in-memory): `lib/roster/undo.ts` with `push`, `canUndo`, `undo`

—

## Migration and Back-Compat

- Rehydrate bootstrap: when `rosters` is empty but legacy `players` exist, a default Score Card roster is created and activated.
- Legacy mapping: `player/*` events keep the active Score Card roster in sync. New UI dispatches `roster/*`.
- Tests that asserted full `AppState` equality now compare legacy fields when roster metadata is incidental.

—

## SP First-Run

- If no active SP roster exists, the Single Player page prompts to:
  - Clone current Score Card roster, or
  - Quick start with “You” + N bots (2–6)

—

## Recipes

- Create and activate a new Single Player roster
  1. `roster/created { rosterId, name: 'Single Player', type: 'single' }`
  2. `roster/player/added ...` x N
  3. `roster/players/reordered { order }`
  4. `roster/activated { rosterId, mode: 'single' }`

- Get ordered players for SP: `selectPlayersOrderedFor('single')`

—

## Testing

- Unit tests: `tests/unit/roster-*.test.ts` cover events, selectors, guards, and undo.
- Integration: bootstrap and legacy mapping paths are covered; adapter usage guard prevents direct SP reads of `state.players`.
