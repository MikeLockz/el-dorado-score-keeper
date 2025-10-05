**Executive Summary**

- **Goal:** Make player management robust, mode-aware, and pleasant to use by promoting rosters to first-class entities, tightening event contracts, improving SP/Score Card UX, and hardening safety/validation.
- **Approach:** Introduce a roster-centric data model with mode-scoped active rosters, namespaced events and selectors, clear UI flows with guardrails, and a focused roster utility module. Ship via a backward-compatible, phased migration.

**Current Limitations**

- **Single shared roster:** `state.players` is used by Score Card and Single Player (SP), causing cross‑mode coupling and surprising resets/edits.
- **Implicit seeding:** SP auto-creates players, removing user choice for player count and naming.
- **Ambiguous identity:** SP doesn’t consistently mark the human “you” player.
- **Scattered logic:** Player add/remove/order rules and name defaults are spread across reducers and components, hard to evolve and test.
- **Fragile selectors:** Views sometimes read `state.players` directly, risking wrong-roster bugs as SP grows.

**Proposed Architecture**

- **Rosters as first-class entities:** Consolidate all player lists into durable roster records with identity, order, type, and timestamps. Maintain separate “active” roster handles per mode.
- **Mode-scoped events/selectors:** Namespaced events and adapter selectors reduce duplication and prevent cross-mode data bugs.
- **UX-first flows:** Replace implicit SP seeding with an explicit first-run modal, better reset confirmations, and human player marking.
- **Safety and validation:** Add undo/redo for roster edits, destructive action detail prompts, and consistent min/max player guards.
- **Developer maintainability:** A new `lib/roster` module for pure operations, discriminated event unions, tests, and docs.

**Data Model**

- **Rosters as First-Class Entities:**
  - `rosters: Record<UUID, { name: string; playersById: Record<UUID, string>; displayOrder: Record<UUID, number>; type: 'scorecard' | 'single'; createdAt: number }>`.
  - `activeScorecardRosterId: UUID | null` and `activeSingleRosterId: UUID | null` in root state.
  - Score Card rounds/scores continue to live in root `rounds`/`scores` but views resolve players from the active scorecard roster.
  - SP play state (`state.sp`) keeps order for the current deal/round, while the canonical roster order lives in `rosters[rosterId].displayOrder`.
  - Games reference `rosterId` in history/export to reconstruct context accurately.
- **Mode-Scoped Active Roster:**
  - Switching active roster is a pointer update (no mutation of other rosters), enabling multiple concurrent SP and Score Card lineups.
- **Name Templates:**
  - Central helpers: `defaultHumanName(i)`, `defaultBotName(i)`; locale-aware and i18n-integrated. Eliminates scattered literals like “Player 1”/“Bot 2”.

**Events and Selectors**

- **Namespaced Events (roster/\*):** Discriminated by `rosterId` or `mode` in payload.
  - `roster/created { rosterId, name, type }`
  - `roster/renamed { rosterId, name }`
  - `roster/activated { rosterId, mode: 'scorecard' | 'single' }`
  - `roster/player/added { rosterId, id, name }`
  - `roster/player/renamed { rosterId, id, name }`
  - `roster/player/removed { rosterId, id }`
  - `roster/players/reordered { rosterId, order: string[] }`
  - `roster/reset { rosterId }`
  - SP can emit `sp/*` as today for engine steps; rosters are orthogonal inputs.
- **Selector Adapters:** Avoid raw `state.players` reads in feature code.
  - `selectActiveRoster(mode)` → `{ rosterId, name, playersById, displayOrder } | null`.
  - `selectPlayersOrderedFor(mode)` → `Array<{ id, name }>` resolved from the active roster with display-order fallback.
  - `selectHumanIdFor(mode)` → string | null; SP uses this to annotate “(you)”.
  - Update existing helpers to accept `mode` or `rosterId` to keep callsites explicit and safe.
- **Seat Order Consistency:**
  - Persist display order per-roster. Imports preserve order; on conflicts, show “re‑seat human first” toggle.
  - SP deals rotate leader/dealer per rules; the canonical seating order comes from the active SP roster’s `displayOrder`.

**Safety and Recovery**

- **Undo/Redo (Local):**
  - Maintain a small in-memory stack of roster edits within the session: add/rename/remove/reorder/reset. Surface “Undo” snackbars (e.g., after Reset).
  - Justification: Most user mistakes during player setup are configurational and easily reversible without affecting persisted event history.
- **Destructive Action Details:**
  - Confirmation dialog lists exactly what changes: e.g., “Remove 5 players, keep prior scores intact” or “Reset SP roster only; Score Card unaffected”.
  - Disable destructive buttons when already empty; align copy with scope and counts.
- **Validation Guards:**
  - Enforce min/max consistently (2–10). SP deal blocked if < 2 players; helpful error copy and guidance.
  - Validate duplicates/blank names with inline errors and keyboard-friendly recovery.

**Defaults and Automation**

- **First-Run Smart Defaults (SP):**
  - On `/single-player` if no active SP roster or roster empty: modal “How many players?” with 2–6 quick picks (+ custom up to 10 if supported). Primary: “Start”.
  - If a Score Card roster exists with players, offer “Use current Score Card players” as one-click option.
- **Remember Choices:**
  - Persist last SP player count and bot naming style. Preselect on next visit to speed setup.
- **Randomize Single Player:**
  - Human is not always first; seat order is generated by shuffling bots and inserting human per toggle (“human first” vs “random seats”).
  - SP order still follows rules for rotating dealer, first player per round, and per trick; the generated roster order is the canonical base order that the SP engine rotates from.
  - Persist the roster order in `displayOrder` and reference `rosterId` in SP game data for reproducibility.

**Interoperability**

- **i18n-Ready Names:**
  - Default name templates run through the i18n layer, enabling localized defaults and correct pluralization. Ensure templates accept locale and index parameters.

**Developer Maintainability**

- **Roster Module:**
  - Add `lib/roster/` with pure utilities:
    - `create({ name, type })`, `clone(roster)`, `rename(roster, name)`, `addPlayer(roster, id, name)`, `removePlayer(roster, id)`, `reorder(roster, ids)`, `import/export`, `defaultHumanName`, `defaultBotName`.
    - All functions pure and unit-tested; reducers call these to keep logic centralized.
- **Type Refinement:**
  - Discriminated unions for roster events with `type` and payload including `rosterId`.
  - Mode-safe helper types to avoid mixing SP/Score Card accidentally.
  - Narrow selectors so SP/scorecard feature code cannot read the wrong roster without a type escape.
- **Tests:**
  - Unit: roster utils (create/clone/rename/reorder), selectors (ordered views, human id), event reducers (roster namespacing).
  - UI: SP first-run modal, import/copy roster, human marking, scoped resets with confirmation details.
  - Property tests: min/max constraints and reorder stability.
- **Docs:**
  - Update this document with event contracts and examples; add “Roster Patterns” for contributors with do/don’t examples and migration notes.

**Detailed Recommendations and Justifications**

- **DM1: Introduce Rosters, keep Score Card stable**
  - Recommendation: Keep existing `rounds`/`scores` model intact; route all roster-aware reads via the active scorecard roster. SP engine continues to use `state.sp` for runtime, but its player list comes from the SP roster.
  - Justification: Minimizes churn in scoring logic while eliminating cross-mode coupling. Provides a clean pivot for future Multiplayer.
- **DM2: Mode-scoped active roster pointers**
  - Recommendation: Store `activeScorecardRosterId` and `activeSingleRosterId`; switching is O(1) and side-effect free.
  - Justification: Supports multiple concurrent lineups (e.g., a family scorecard vs. a solo practice roster) and enables quick toggling.
- **DM3: Persist display order in rosters**
  - Recommendation: Migrate `display_order` into `rosters[rosterId].displayOrder`. SP round order is derived from roster and rotated per rules.
  - Justification: Eliminates duplication and drift between UI and engine order; order changes become explicit roster edits.
- **EV1: Namespaced events**
  - Recommendation: Replace unscoped `player/*` with `roster/player/*`, plus `roster/*` lifecycle events.
  - Justification: Prevents wrong-roster edits; payloads self-describe the target roster, enabling stateless event processing and safer import/export.
- **EV2: Selector adapters**
  - Recommendation: Add `selectPlayersOrderedFor(mode)` and friends; remove raw `state.players` reads from feature code.
  - Justification: Centralized logic reduces bugs and enables caching/memoization. Mode parameter makes intent explicit.
- **UX1: SP first-run modal**
  - Recommendation: No implicit seeding. Modal to choose player count, offer “Use Score Card players”, remember last selection.
  - Justification: Reduces surprise, shortens first-run to one decision, and adapts to returning users.
- **UX2: Human identity clarity**
  - Recommendation: Consistently mark the human in SP views with “(you)” or a badge; do not persist suffix in state.
  - Justification: Clear identity improves comprehension without polluting data.
- **UX3: Scoped resets with details**
  - Recommendation: Separate Score Card vs SP reset actions with impact summaries and Undo.
  - Justification: Prevents data loss and increases confidence.
- **SF1: Undo/redo for roster edits**
  - Recommendation: Lightweight in-memory stack keyed by rosterId; replay last change only. Expose Undo in toasts and action bars.
  - Justification: High impact for low complexity, covers most mistakes.
- **VAL1: Min/max enforcement**
  - Recommendation: Enforce 2–10 player bounds at reducers and UI. SP deal asserts at least 2 active players.
  - Justification: Consistency and safety across screens.
- **AUTO1: Randomize bots and persist**
  - Recommendation: Shuffle bots on creation/import; persist in `displayOrder`. SP engine rotates per round/hand as it does today.
  - Justification: Varies gameplay while preserving deterministic persistence and compliance with existing rotation rules.
- **I18N1: Name templates via translation layer**
  - Recommendation: Pipe defaults through i18n to support locales out of the box.
  - Justification: Improves reach and professionalism with minimal cost.
- **DX1: Roster module**
  - Recommendation: Encapsulate roster ops under `lib/roster` with pure functions and tests; reducers delegate to it.
  - Justification: Lowers cognitive load and increases testability.
- **DX2: Discriminated event unions**
  - Recommendation: Extend `EventMap` with roster events; export `RosterEvent` union for narrowed handling.
  - Justification: Compile-time safety and easier refactors.
- **DX3: Comprehensive tests**
  - Recommendation: Add unit and UI tests covering new flows; property tests on ordering and constraints.
  - Justification: Confidence during migration and future changes.

**Migration Strategy**

- **Phase 0: Introduce model alongside current fields**
  - Add `rosters`, `activeScorecardRosterId`, `activeSingleRosterId` to `AppState`. Create a default Score Card roster from existing `players` and `display_order` at rehydrate time if rosters are empty.
  - Add read adapters so existing UI can continue using `selectPlayersOrdered` mapped to the active Score Card roster.
- **Phase 1: Add roster events (write path)**
  - Emit `roster/*` for all new actions. Continue to accept legacy `player/*` and map them to the active Score Card roster internally.
  - Begin updating UI to dispatch `roster/*` with explicit `rosterId`.
- **Phase 2: SP adoption**
  - Add SP roster creation on first-run modal. Stop implicit seeding. Switch SP UI and engine to use `selectPlayersOrderedFor('single')` and `selectHumanIdFor('single')`.
- **Phase 3: Removal of legacy writes**
  - Flip feature flag to stop emitting `player/*`. Keep reducer compatibility for historical events.
- **Phase 4: Cleanup**
  - Remove `players`/`display_order` from new snapshots after deprecation window; keep reducer shims for import of old bundles.

—

Note: Implementation followed this plan in phases. See docs/ROSTERS.md for the roster model, events and selectors, and migration notes. Legacy `player/*` writes are currently mapped into the active Score Card roster for backward compatibility.

**File and Code Touchpoints**

- `lib/state/types.ts`:
  - Add `rosters`, `activeScorecardRosterId`, `activeSingleRosterId`, and optional `humanByMode?: { single?: string | null }` for clarity.
  - Extend `EventMap` with `roster/*` events; add reducers that delegate to `lib/roster`.
  - Keep legacy `player/*` reducer paths mapping to the active Score Card roster during migration.
- `lib/state/events.ts`:
  - Add factories for `roster/*` events.
- `lib/state/selectors.ts` and `lib/state/selectors-sp.ts`:
  - Add `selectActiveRoster(mode)`, `selectPlayersOrderedFor(mode)`, `selectHumanIdFor(mode)`; rewrite internal helpers to use rosters.
  - Update SP selectors that derive counts/order to read from the SP roster where appropriate.
- `lib/roster/*`:
  - New module with pure utilities and unit tests.
- `app/players/page.tsx` and `components/players/*`:
  - Split management UI into Score Card and Single Player sections; scoped reset actions; import/export roster.
  - Add roster switcher and actions (create/clone/rename/delete) with confirmations.
- `app/single-player/page.tsx` and `components/views/SinglePlayerMobile.tsx`:
  - Use `selectPlayersOrderedFor('single')` and `selectHumanIdFor('single')`. Add first-run modal to seed SP roster.
- `lib/state/instance.ts` (rehydration):
  - If `rosters` empty but `players` present, create default scorecard roster and set `activeScorecardRosterId`.
  - If both are empty, leave for UI to prompt first-run.
- `lib/state/io.ts` and analytics:
  - Include `rosterId` in exports and analytics reconstruction to resolve names from the correct roster.

**UI Details**

- **Players screen**
  - Two cards: “Score Card Players” and “Single Player Roster”. Each shows count, actions (Add, Reorder, Reset), and “Active” badge if selected.
  - Reset buttons disabled when empty; confirmation modal specifies counts: “Remove 5 players; keep scores intact”.
  - Import/copy: allow cloning Score Card roster into SP roster and vice versa.
- **SP first-run modal**
  - Radios or quick buttons for 2–6; advanced input up to 10. Optional toggle “Use current Score Card players”. Primary “Start”.
  - Human named via `defaultHumanName(1)`, bots via `defaultBotName(i)`; apply i18n.
- **Name display**
  - Append “(you)” only in SP views for the human id; no state mutation.

**Validation and Safety Rules**

- **Hard guards:**
  - Reducers block SP deal if < 2 players in active SP roster.
  - Reducers enforce 2–10 players; reorder ignores unknown ids and re-compacts order densely.
- **Soft UX guards:**
  - Disable actions when invalid; explain why in tooltips.
  - Toast + Undo for reset/remove-all; undo replays inverse edit via roster module.

**Testing Plan**

- Unit tests
  - Roster utils: create/clone/rename/import/export/reorder; min/max enforcement; order stability; idempotent remove.
  - Selectors: `selectPlayersOrderedFor`, `selectActiveRoster`, `selectHumanIdFor` on empty, partial, and full states.
  - Reducers: legacy `player/*` → active scorecard roster mapping; `roster/*` correctness; rehydration bootstrap from legacy fields.
- UI tests
  - SP first-run modal flows (new roster, use scorecard roster, remember last N).
  - Players page: scoped resets, reorder, human marking, import/copy between rosters.
  - SP seating randomness: bots shuffled; human placement toggle respected; persisted across reloads.
- Property tests
  - Reorder permutations always produce dense 0..N-1 indices and preserve relative order for unspecified ids.

**Rollout and Backward Compatibility**

- Keep accepting legacy `player/*` events for import and historical playback; map to the active scorecard roster internally.
- Rehydrate hook creates default scorecard roster from legacy fields once, without altering event history.
- Feature flag or config gate for switching UI to `roster/*` dispatches; allow staged rollout.

**Risks and Mitigations**

- **Missed selector updates:** Some SP views still read `state.players`.
  - Mitigation: `rg` sweep with lint rule banning direct `state.players` reads outside adapter selectors; add tests for SP with 2/5/6 players.
- **User confusion around multiple rosters:**
  - Mitigation: Clear “Active” labeling, concise descriptions, and import/copy affordances.
- **Migration complexity:**
  - Mitigation: Backward-compatible reducers and rehydrate bootstrap; phased UI migration; comprehensive tests.

**Acceptance Criteria**

- Editing Score Card players does not change SP roster, and vice versa.
- Navigating to `/single-player` with no SP roster prompts for player count or using existing Score Card roster; no auto-seeding.
- SP displays “(you)” consistently for the human player without mutating names in state.
- Min/max rules enforced everywhere; SP deal blocked < 2 players with a friendly error.
- Player order persists per roster and drives SP rotation correctly; bots are shuffled at creation if enabled.
- Roster events are namespaced and type-safe; selectors operate via adapters keyed by mode.
- Unit and UI tests cover new behaviors; docs explain roster patterns and migration.

**Next Steps (Implementation Outline)**

- Data: add `rosters` + active pointers; rehydrate bootstrap from legacy fields.
- Events: implement `roster/*`; keep legacy `player/*` mapping.
- Selectors: add mode-aware adapters; refactor SP and Score Card views to use them.
- UI: players screen split + SP first-run modal + confirmations with detail.
- Safety: undo/redo stack for roster edits; validation guards.
- DX: add `lib/roster/` utilities; tests and docs.
