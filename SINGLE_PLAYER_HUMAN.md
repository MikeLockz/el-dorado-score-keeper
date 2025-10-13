# SINGLE PLAYER HUMAN – IMPLEMENTATION REQUIREMENTS

## Goals

- Decouple the single-player “human slot” from the general roster/player management UI.
- Provide a dedicated component that surfaces the single-player human’s identity, metadata, and statistics without relying on roster chips.
- Ensure single-player flows (new game, roster activation, statistics) interact with the extracted entity consistently across state, selectors, analytics, and UI.
- Preserve existing roster behaviours for scorecard/single rosters while preventing the single-player human from appearing in roster manipulation grids and dropdowns.

## Terminology

- **Human SP ID**: The canonical player UUID stored for the active single-player roster’s human. Currently inferred via player state; will become explicit.
- **Scorecard roster**: Multi-player roster used for standard games.
- **Single roster**: Roster used for single-player mode (bots + human anchor).
- **Human card**: New UI element dedicated to the single-player human.

## State & Data Model

1. **New explicit entity**
   - Extend `AppState['humanByMode']` to guarantee a defined key for `single` (`string | null`) and document it as the authoritative source for the single-player human id.
   - Introduce helper type `SinglePlayerHuman` encapsulating `{ id: string; name: string; type: 'human' | 'bot'; archived: boolean }`.

2. **Event support**
   - Add event variants under a new namespace (e.g., `sp/human/*`) or reuse existing player events with mode context:
     - `sp/human/set`: point `humanByMode.single` to a specific player id (existing human or newly created).
     - `sp/human/rename`: rename the human without touching roster arrays (may alias to `player/renamed` but triggered via dedicated function).
     - `sp/human/type-set`: optional if bots ever permitted.
     - `sp/human/clear`: remove reference (used when archiving/deleting).
   - Ensure reducers keep `humanByMode.single` in sync when:
     - Human is archived or deleted globally.
     - Related roster is reset/rebuilt (e.g., import/copy flows).
     - SP game rehydrates from legacy data (migration path).

3. **Selectors / helpers**
   - `selectSinglePlayerHuman(state): SinglePlayerHuman | null` that:
     - Reads `humanByMode.single`, falls back to roster inference only during migration.
     - Resolves name/type/archived from `playerDetails` with fallback to `players`.
     - Provides `archived` boolean and ts for analytics.
   - `useSinglePlayerHuman()` hook (client) returning `{ human, loading, actions }`:
     - `actions.rename(name)`, `actions.archive()`, `actions.restore()`, `actions.setPlayer(id)`.

4. **Migration strategy**
   - One-time guard: if `humanByMode.single` is null but single roster contains a human entry, set the explicit id.
   - Ensure historical events imported from storage map the human id to the new state path before UI mounts.

## UI Requirements

1. **Players page (`/players`)**
   - Remove the single-player human from the roster chips/listing sections.
   - Add a new card component (e.g., `SinglePlayerHumanCard`) near the single-player roster column:
     - Displays name, type, archived indicator, created/updated metadata.
     - Includes actions: view stats, rename, archive/restore toggle, “Change player…” to pick from existing unarchived players (modal + search).
     - Surfaces warnings if archived/null (e.g., requires setup before starting SP game).
   - Update dropdowns: when adding players to rosters, exclude the SP human automatically.

2. **Single-player flows**
   - Single-player new game page and in-game overlays should use the selector/hook for the human name instead of reading roster arrays.
   - If the human is archived/null, prompt to set a new one before starting (consistent toast/confirm).
   - Statistics CTA from the card links to `/players/{id}/statistics` (existing route).

3. **Archived views**
   - Archived rosters list should not show the human (since it’s now separate).
   - Players archived list remains the source of truth for restoring the human; card should reflect that state and offer quick restore.

## Component Architecture

1. **New components**
   - `components/players/SinglePlayerHumanCard.tsx` (client) + SCSS module.
   - Variant for archived state with call-to-action to restore/set new human.
   - Use existing UI primitives (`Card`, `Button`, `Input`, `toast`, dialogs).

2. **Dialog flows**
   - Rename uses existing prompt dialog (with validation for uniqueness).
   - “Change player” opens a list (modal) of eligible players; selecting one dispatches `sp/human/set`.
   - Archive flow uses confirm dialog (consistent destructive messaging).
   - Create new player from card should mirror current creation flow but automatically set as SP human and add to SP roster if needed.

## Analytics & Telemetry

1. Track card interactions:
   - `trackSinglePlayerHumanViewed` when card renders with ready state (include archived flag).
   - `trackSinglePlayerHumanRenamed`, `trackSinglePlayerHumanArchived`, `trackSinglePlayerHumanRestored`, `trackSinglePlayerHumanChanged` (with `fromId`/`toId`).
2. Update existing `useNewGameRequest` analytics to include human id presence (avoid double counting `trackPlayersAdded` since the human is no longer in roster arrays).

## Testing

1. **Unit**
   - Reducer tests validating new events, migration guard, and interactions with roster resets/archives.
   - Selector tests for `selectSinglePlayerHuman` covering cases: explicit id, fallback, archived, missing.

2. **UI**
   - Add integrated tests for the new card verifying:
     - Display of name/type, archived state message.
     - Rename flow triggers correct events.
     - Change-human modal updates state (mock confirm).
     - Archive/restore buttons dispatch properly and update UI.
   - Update players page UI tests to confirm:
     - SP human absent from roster chips/dropdowns.
     - Card presence and CTA behaviours.

3. **Regression**
   - Ensure existing roster tests still pass (adjust fixtures where single human was previously embedded).
   - Validate SP mode flows via existing E2E or smoke tests once selectors are updated.

## Documentation & Developer Experience

1. Update relevant docs (`PLAYER_MANAGEMENT_ENHANCEMENTS`, `UPDATED_PLAYER_ENHANCEMENTS`) to describe the new single-player human model.
2. Provide guidance in the new component file explaining the separation (comment linking to this requirement doc).
3. Add storybook/example (optional) demonstrating the card in active and archived states for DX.

## Rollout Considerations

- Fallback compatibility: while migrating, keep the ability to derive the human id from the SP roster to avoid blank states on older saved data (one-render fallback with warning log).
- Feature flag optional: wrap UI with a one-way gate (e.g., `enableSingleHumanCard`) to allow staged rollout if necessary.
- Monitor analytics for missing human IDs; log warnings if card cannot resolve a human while single-player roster has bots configured.

## Acceptance Criteria

- Single-player human no longer appears in roster player lists, dropdowns, or archived roster views.
- The new card reflects the single-player human status and allows full management (rename, change, archive/restore, stat link).
- All state transitions (change, archive, delete) keep `humanByMode.single` consistent, and single-player mode refuses to start without a valid human, prompting via the new card.
- Tests covering reducers, selectors, and UI pass, along with existing suites impacted by the change.
