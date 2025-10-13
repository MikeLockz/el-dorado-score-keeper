# SINGLE PLAYER BOTS – IMPLEMENTATION REQUIREMENTS

## Objectives

- Surface every bot used in single-player mode inside `/players` without mixing them into the existing player management list.
- Provide navigation from the new bot inventory to `/players/{botId}/statistics` (and any future bot analytics) using consistent UI affordances.
- Support basic bot lifecycle actions (rename, type toggle if applicable, archive/restore) while clearly separating bot management from human roster flows.
- Avoid disrupting current roster management, drag/drop ordering, or scorecard player interactions.

## Scope

- Applies to bots present in any single-player roster (active or archived). Scorecard-mode bots already visible through existing lists are out of scope for this doc.
- No state persistence changes to bot scoring/statistics beyond linking the UI to existing statistics routes.

## Data & State

1. **Bot inventory derivation**
   - Define selector `selectSinglePlayerBots(state): SinglePlayerBot[]` returning unique bot entries from every single-player roster:
     - `id`, `name`, `originRosterId`, `archived` flag (if roster archived or bot archived globally), `createdAt`, `updatedAt`.
     - Deduplicate bots referenced across multiple SP rosters. Prefer details from `playerDetails` if available.
   - Provide helper `selectArchivedSinglePlayerBots` (subset where bot is archived).

2. **Event interactions**
   - Reuse existing roster/player events for mutations:
     - `roster/player/renamed`, `roster/player/type-set`, `roster/player/removed`, `roster/player/added`.
     - When a bot is archived globally (via `playerRemoved` or future archive event), ensure selectors mark it archived.
   - Optional: add helper actions to mutate bots through `useBotManagement()` hook (see below) so the UI does not call low-level appenders directly.

3. **Hooks / Utilities**
   - `useSinglePlayerBots()` (client hook) providing:
     - `bots`, `archivedBots`, loading state.
     - Action helpers: `rename(botId)`, `toggleType(botId)`, `archive(botId)`, `restore(botId)`, `viewStats(botId)`.
   - Hook should guard interactions through `runWithPlayerError` (shared error pipeline) to keep analytics consistency.

## UI Requirements

1. **Placement within `/players`**
   - Introduce a new section card (e.g., `SinglePlayerBotInventory`) beneath the existing rosters area.
   - Section layout:
     - Header with icon (Robot), title “Single-player bots”, short description.
     - Tab or toggle to switch between active and archived bots (checkbox or segmented control).
     - List view (grid or stacked rows) summarizing bots: name, roster count, last played (optional), type.

2. **Bots list interactions**
   - Each bot row offers:
     - `View stats` button routing to `/players/{botId}/statistics`.
     - `Rename` action (prompt dialog with uniqueness validation).
     - `Toggle Bot/Human` if the system supports switching type (keep existing semantics; default to `bot`).
     - `Archive` (confirm dialog) to deactivate the bot (should remove from SP roster or mark absent).
   - Archived view should offer `Restore` CTA, link back to active list.

3. **Empty states**
   - Active view: “No single-player bots yet. Start a single-player game to add bots.”
   - Archived view: “No archived bots” and link to active view.

4. **Accessibility & Responsiveness**
   - Ensure rows are keyboard focusable, with `Enter/Space` opening stats.
   - Provide screen-reader labels for stats navigation (“View statistics for Bot X”).
   - Responsive grid stacking similar to existing roster cards.

5. **Visual consistency**
   - Reuse `Card`, `Button`, `Badge` patterns from player management.
   - Use new SCSS module for bot section (`single-player-bots.module.scss`) referencing tokens/mixins from `styles`.

## Behavioural Details

1. **Eligibility filter**
   - Display bots linked to any single-player roster (active or archived). If the global player detail says `type === 'bot'`, include even if not currently assigned, but mark as “Unassigned”.
   - Exclude human entries (even if `type: 'human'`) to avoid confusion.

2. **Statistics route**
   - Before navigating to `/players/{botId}/statistics`, ensure the route exists (stats view handles both humans & bots). Provide loading toast if necessary.

3. **Roster impact**
   - When archiving a bot via the bot inventory, update associated SP rosters (remove player or mark absent). Define exact behaviour:
     - Recommendation: dispatch `rosterPlayerRemoved` on each SP roster referencing the bot to prevent ghost entries; optionally pair with toast about requiring replacement.
   - When restoring, optionally re-add to original roster (requires storing `originRosterId`). Provide fallback message if roster missing.

4. **Analytics**
   - Track events: `trackSinglePlayerBotViewedList`, `trackSinglePlayerBotOpenedStats`, `trackSinglePlayerBotRenamed`, `trackSinglePlayerBotArchived`, `trackSinglePlayerBotRestored`.
   - Include metadata: `botId`, `botName`, `originRosterId`, archived status, counts.

## Testing

1. **Selectors & hooks**
   - Unit tests for `selectSinglePlayerBots`, ensuring deduplication and archived detection.
   - Hook tests (using React testing library) verifying actions dispatch expected events.

2. **UI integration**
   - Extend `tests/ui/players-page-ui.test.tsx` (or new spec) to cover:
     - Rendering of bot section with sample data.
     - Stats button navigation.
     - Rename & archive flows (mock dialogs).
     - Archived toggle functionality.

3. **Regression coverage**
   - Ensure existing player/roster tests still pass; adjust fixtures to include bots if necessary.
   - Consider smoke test verifying deep link to bot stats works from new button (can stub router push).

## Documentation & DX

1. Update relevant design docs (`PLAYER_MANAGEMENT_ENHANCEMENTS`, `IMPLEMENT_PLAYER_STATISTICS`) to describe the bot inventory and stats access.
2. Add storybook entry (optional) for the bot inventory component with sample bots.
3. Cross-reference this requirement doc in component comments and PR description.

## Rollout Plan

1. **Feature flag** (optional)
   - Introduce configuration value `enableSinglePlayerBotInventory` to gate the UI if staged rollout is desired.
   - Default to disabled until the team is ready; ensure selectors/hooks exist regardless to avoid runtime divergence.

2. **Migration**
   - No data migrations required; selectors use existing roster/player state.
   - Inform QA to test both new and legacy data sets (with/without bots).

3. **Telemetry verification**
   - After launch, monitor analytics for bot stats openings to confirm adoption.

## Acceptance Criteria

- `/players` displays a dedicated “Single-player bots” card listing all SP bots with up-to-date metadata.
- Clicking `View stats` from the bot list navigates to the correct statistics page.
- Rename, archive, restore actions from the bot card update state and UI, including associated rosters.
- Archived bots can be surfaced via the toggle and restored back to active.
- Existing roster/player management flows remain unaffected (no bots in standard player list or dropdowns).
