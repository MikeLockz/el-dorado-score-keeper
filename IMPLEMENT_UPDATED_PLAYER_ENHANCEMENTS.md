# IMPLEMENTATION PLAN — Updated Player Enhancements

A phased, backward-compatible plan to implement UPDATED_PLAYER_ENHANCEMENTS.md. Each phase ships in small, verifiable steps with format, lint, typecheck, and tests green before moving on. Follow existing repo patterns and keep documentation current.

—

## Tech/Conventions

- Framework/tooling: Next.js App Router (TypeScript, React 19), Vitest, ESLint, Prettier, Zod.
- Commands per phase: `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`.
- Keep diffs scoped. Prefer pure utilities under `lib/roster/*` with focused tests.
- Preserve backward compatibility during migration (legacy `player/*` reads/writes continue to work until cleanup phase).

—

## Phase 0 — Scaffold Roster Model (non-breaking)

Scope

- Extend `AppState` with roster primitives alongside existing fields (no behavior change yet):
  - `rosters: Record<UUID, { name: string; playersById: Record<UUID, string>; displayOrder: Record<UUID, number>; type: 'scorecard' | 'single'; createdAt: number }>`.
  - `activeScorecardRosterId: UUID | null`, `activeSingleRosterId: UUID | null`.
  - Optional `humanByMode?: { single?: string | null }` for clarity (may remain null initially).
- Rehydrate/bootstrap in `lib/state/instance.ts`:
  - If `rosters` is empty and legacy `players` exists, create a default Score Card roster and set `activeScorecardRosterId`.
  - Do not mutate legacy event history; bootstrap happens at instance load only.
- Create `lib/roster/index.ts` with types and no-op helpers (stubs) to anchor the module.

Acceptance

- Existing app behavior unchanged; state includes new keys with sensible defaults.
- Fresh instances without legacy players keep rosters empty and pointers null.

Tests

- Add `tests/integration/rehydrate-roster-bootstrap.test.ts`:
  - With legacy `players`, bootstrap creates a scorecard roster and sets it active.
  - With neither legacy players nor rosters, leaves rosters empty and pointers null.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "state: scaffold roster model and bootstrap from legacy players"

—

## Phase 1 — Roster Events + Validation

Scope

- Add namespaced roster events to `EventMap` and Zod schemas in `lib/state/validation.ts`:
  - `roster/created { rosterId, name, type }`
  - `roster/renamed { rosterId, name }`
  - `roster/activated { rosterId, mode: 'scorecard' | 'single' }`
  - `roster/player/added { rosterId, id, name }`
  - `roster/player/renamed { rosterId, id, name }`
  - `roster/player/removed { rosterId, id }`
  - `roster/players/reordered { rosterId, order: string[] }`
  - `roster/reset { rosterId }`
- Add factories in `lib/state/events.ts`.
- Implement reducers in `lib/state/types.ts` delegating to pure helpers in `lib/roster/ops.ts`.
- Keep legacy `player/*` reducer paths intact (no behavior change yet).

Acceptance

- Dispatching new `roster/*` events mutates `rosters` and active pointers as expected; legacy fields remain in sync only where explicitly updated (not required yet).

Tests

- `tests/unit/roster-events.test.ts` validates payload schemas and reducer effects for each roster event.
- Extend `tests/unit/reducer-contract.test.ts` to include new event types in the schema coverage assertion.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "state: add roster/* events, schemas, and reducers via lib/roster"

—

## Phase 2 — Selector Adapters (read path)

Scope

- Add mode-aware selectors in `lib/state/selectors.ts` and `lib/state/selectors-sp.ts`:
  - `selectActiveRoster(mode)` → `{ rosterId, name, playersById, displayOrder } | null`.
  - `selectPlayersOrderedFor(mode)` → `Array<{ id, name }>` resolved from active roster with display-order fallback.
  - `selectHumanIdFor(mode)` → string | null.
- Provide shims for existing helpers so features stop reading `state.players` directly.
- Add an internal lintable adapter export used by views; document best practice in code comments.

Acceptance

- All new selectors return correct values against both bootstrapped legacy state and native roster state.

Tests

- `tests/unit/roster-selectors.test.ts` covering empty, partial, and full states for both modes.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "state: add mode-aware roster selectors and shims"

—

## Phase 3 — SP First-Run and Adoption (UI + engine read)

Scope

- Single Player adopts roster adapters:
  - In `app/single-player/page.tsx` and `components/views/SinglePlayerMobile.tsx`, use `selectPlayersOrderedFor('single')` and `selectHumanIdFor('single')`.
  - Add a first-run modal when no active SP roster exists:
    - Quick options for 2–6 (advanced up to 10) and a toggle to use current Score Card roster.
    - On submit, emit `roster/created`, `roster/player/added` events for SP roster, set human, and `roster/activated` for mode 'single'.
- Engine reads seating order from SP active roster display order; do not mutate roster names for “(you)” UI — annotate in view only.

Acceptance

- Navigating to `/single-player` with no SP roster prompts for setup; proceeding creates and activates a roster.
- SP view and engine function with the new selectors; no implicit player seeding remains.

Tests

- `tests/ui/sp-first-run.test.tsx` covering modal flows: new roster, clone from scorecard, min/max validation.
- Light unit test to ensure engine derives order from SP roster when present.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "sp: adopt roster selectors and add first-run roster modal"

—

## Phase 4 — Players Screen Split and Scoped Actions

Scope

- Update players management UI:
  - Split into two cards/sections: “Score Card Players” and “Single Player Roster”.
  - Add roster switcher and actions: create, clone, rename, delete, reset; destructive actions gated by confirmations listing specific impacts.
  - Disable destructive buttons when empty; copy clarifies scope and counts.
- Dispatch `roster/*` events from UI; legacy UI paths remain functional during this phase.

Acceptance

- Managing Score Card players does not affect SP roster, and vice versa.
- Active roster is clearly labeled; switcher updates `active*RosterId` accordingly.

Tests

- `tests/ui/players-rosters.test.tsx` covering scoped reset, reorder, rename; active labeling; cloning between rosters.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "ui(players): split management into scorecard vs single rosters with scoped actions"

—

## Phase 5 — Undo/Redo and Validation Guards

Scope

- Add a lightweight in-memory undo stack for roster edits in `lib/roster/undo.ts` and integrate snackbars/toasts for Undo on reset/remove-all.
- Enforce min/max player guards (2–10) and duplicate/blank name validation in `lib/roster/ops.ts` and corresponding reducers.
- Block SP deal initiation if `< 2` players in active SP roster; surface friendly error in UI.

Acceptance

- Undo restores previous roster state for supported edits within the session.
- All guards enforced consistently across UI and reducer paths.

Tests

- `tests/unit/roster-guards.test.ts` for min/max, duplicate, and blank names.
- `tests/unit/roster-undo.test.ts` for undo stack behavior.
- Extend SP tests to ensure deal blocked `< 2` players.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "roster: add undo/redo and validation guards; block SP deal <2"

—

## Phase 6 — Legacy Event Mapping and Lint Guard

Scope

- Maintain reducer compatibility for historical `player/*` events but stop emitting them from UI:
  - Add mapping so legacy `player/*` writes update the active Score Card roster internally.
  - Add a lint rule or codemod check to ban direct reads of `state.players` in feature code (allow only inside adapters/tests).
- Update exporter/importer `lib/state/io.ts` to include `rosterId` for archives and analytics payloads.

Acceptance

- Legacy event imports still replay correctly; new snapshots prefer roster model.
- Codebase free of new direct `state.players` reads outside selector modules.

Tests

- Integration test: import old bundles containing `player/*` and verify roster bootstrap + mapping produce expected views.
- Static analysis test (if feasible) or grep-based assertion in tests to enforce adapter usage.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "state: map legacy player/* to active scorecard roster; enforce adapter reads"

—

## Phase 7 — Cleanup + Documentation

Scope

- Remove legacy writes from UI; keep reducer shims for import/back-compat.
- Update docs:
  - `docs/` add `ROSTERS.md` describing the model, events, selectors, and migration notes.
  - Update `PLAYER_ENHANCEMENTS.md` and `UPDATED_PLAYER_ENHANCEMENTS.md` cross-references if APIs differ.
  - Annotate examples for SP “(you)” labeling and mode-scoped adapters.

Acceptance

- Docs reflect the implemented architecture; developer onboarding explains rosters clearly.

Tests

- N/A beyond full-suite run; ensure no type or lint regressions.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "docs: roster model, events, adapters; deprecate legacy player writes"

—

## File/Module Map (proposed)

- `lib/roster/index.ts` — Types and exports
- `lib/roster/ops.ts` — Pure operations: create/clone/rename/add/remove/reorder/reset, guards
- `lib/roster/undo.ts` — In-memory undo stack for roster edits
- `lib/state/types.ts` — AppState extensions; reducers delegating to roster ops
- `lib/state/events.ts` — Event factories for `roster/*`
- `lib/state/validation.ts` — Zod schemas for `roster/*`
- `lib/state/selectors.ts` — `selectActiveRoster`, `selectPlayersOrderedFor` (scorecard)
- `lib/state/selectors-sp.ts` — SP-specific adapters including `selectHumanIdFor('single')`
- `lib/state/instance.ts` — Rehydrate/bootstrap from legacy players
- `lib/state/io.ts` — Archive/import/export updates to include `rosterId`
- `app/players/*` — Split UI and scoped actions
- `app/single-player/*` — First-run modal; adoption of selectors
- `tests/**` — Unit, UI, integration, and property tests added per phase

—

## Commands Reference

- Format: `pnpm format:write`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test` (watch: `pnpm test:watch`)

—

## Risks, Rollback, and Acceptance (Overall)

- Risks: missed selector migrations; user confusion around multiple rosters; migration complexity. Mitigations per UPDATED_PLAYER_ENHANCEMENTS.md.
- Rollback: roster ops isolated; UI can temporarily revert to legacy selectors; reducers retain legacy support.
- Exit criteria:
  - Score Card and SP rosters are independent and mode-scoped.
  - SP prompts for setup when missing; no implicit seeding remains.
  - “(you)” labeling is view-only, not stored.
  - Min/max and validation enforced; SP deal blocked `< 2` players.
  - New events/selectors are type-safe and covered by tests.
  - All phases landed with green format/lint/types/tests and updated docs.

