# Implement Player Data Generator

This playbook translates `PLAYER_DATA_GENERATOR.md` into actionable phases. Work through the phases in order, run the suggested validation after each, and cut a commit per phase to keep history readable.

---

## Phase 1 – Schema & Dependency Audit

1. Map roster data structures:
   - Review `lib/state/types.ts` for `RosterState`, `PlayerState`, and any relevant single-player slices.
   - Scan `lib/state/reducer.ts` (and related reducers) to understand required roster payload fields (`seat`, `displayName`, `isBot`, `style`, etc.).
   - Check for Zod or io schema definitions in `schema/` that validate roster/player entries to ensure the generator outputs compatible shapes.
2. Trace current-user derivation:
   - Inspect selectors such as `selectHumanIdFor`, `selectPlayersOrderedFor`, and DevTools components to confirm how the current player profile is built today.
   - Note any optional fields (e.g., `avatarSeed`) required by consumers so the generator provides them.
3. Identify downstream dependencies:
   - Search for usage of roster-specific helpers in `lib/devtools/generator/gameDataGenerator.ts`, `saveGeneratedGame.ts`, DevTools views, and tests to plan refactors.
4. Record open questions in `SCRATCH_PAD.md` (e.g., edge cases for player counts, optional metadata).
5. **Validation:** Run `pnpm typecheck` to make sure the baseline repo is healthy before editing.
6. **Commit:** `feat: audit player roster schemas`.

---

## Phase 2 – Module Scaffolding

1. Create the new module file `lib/devtools/generator/playerDataGenerator.ts`.
2. Implement RNG plumbing:
   - `hashSeed` and `randomSeedString` helpers (mirror existing game generator logic) feeding into `mulberry32`.
   - Export `getRng(seed?: string)` returning a seeded PRNG; accept an optional external RNG in options for advanced use.
   - Provide a minimal `Rng` type alias for reuse.
3. Define shared type exports:
   - `CurrentUserProfile` input contract (id, displayName, optional avatarSeed).
   - `GeneratedPlayerProfile` (id, displayName, avatarSeed).
   - `PlayerStyle` union and `GeneratedRosterEntry` (profile + seat, flags, style).
4. Centralize the name registry:
   - Move the 10-player template list into `NAME_REGISTRY`, preserving existing ids/names.
   - Consider adding a helper for retrieving registry length for validation.
5. Document module intent in comments (usage for DevTools/test harnesses) for future maintainers.
6. **Validation:** Author baseline unit tests at `tests/devtools/__tests__/playerDataGenerator.test.ts` to cover RNG determinism and registry immutability.
7. **Commit:** `feat: scaffold player data generator module`.

---

## Phase 3 – Roster Generation Logic

1. Build normalization helpers:
   - `normalizeCurrentUser` should trim inputs, enforce an id, fallback displayName to `"Player"`, and derive an avatar seed when missing (e.g., slugified name).
2. Implement sampling utilities:
   - `sampleRegistry(count, rng, forbiddenId)` returning unique templates excluding the current-user id.
   - `shuffle` helper using Fisher–Yates to randomize selection deterministically.
3. Style assignment:
   - `assignStyle(rng)` distributing `cautious`/`balanced`/`aggressive` roughly evenly; expose probability thresholds as constants for adjustability.
4. Implement `generateRoster(options)`:
   - Validate/clamp `playerCount` (min 2, max registry length, default 4).
   - Create the current-user entry at seat `0`, `isBot: false`, `isCurrentUser: true`.
   - Append sampled players with incrementing seat numbers, `isBot: true`, and assigned styles.
   - Allow callers to pass an existing `rng`; otherwise create one via `getRng()`.
5. Export additional helpers if needed (`clamp`, `NAME_REGISTRY`) for tests while keeping API surface intentional.
6. **Validation:** Extend unit tests to assert seat order, uniqueness of ids, style values, deterministic output with seeds, and avatar fallback behavior.
7. **Commit:** `feat: implement roster generation helpers`.

---

## Phase 4 – Integration With Game Generator

1. Update `lib/devtools/generator/gameDataGenerator.ts`:
   - Remove in-file definitions for `NAME_REGISTRY`, RNG utilities, and roster types (`GeneratedRosterEntry`, `PlayerStyle`, `CurrentUserProfile`).
   - Import `generateRoster`, `getRng`, and type exports from `playerDataGenerator`, re-exporting where existing consumers expect them.
   - Replace internal helper usage: e.g., the roster creation inside `generateGameData`, references to `PlayerStyle`, and style maps should now rely on imported types.
   - Verify functions such as `generateRoundPlan` correctly interact with the new roster entries (no structural changes).
2. Cascade the refactor:
   - Update `lib/devtools/generator/saveGeneratedGame.ts` to ensure it composes with the updated `generateGameData` signature.
   - Review DevTools entry points (`components/devtools.tsx`, any hooks) for imports referencing `gameDataGenerator` types; ensure they continue to work or import directly from the new module if appropriate.
   - Adjust existing tests (`tests/devtools/__tests__/gameDataGenerator.test.ts`) to import roster helpers from the right module; remove duplicate mocks.
   - Run `rg "NAME_REGISTRY"` and `rg "mulberry32"` to confirm no stray references remain outside the new module.
3. **Validation:** Execute targeted checks—`pnpm test --filter playerDataGenerator`, `pnpm test --filter gameDataGenerator`, plus `pnpm lint` and `pnpm typecheck`. Manually trigger the DevTools “Generate Single Player Game” flow (if feasible) to verify the archive persists and loads correctly.
4. **Commit:** `refactor: reuse player data generator in game generator`.

---

## Phase 5 – Testing & Documentation Wrap-Up

1. Harden automated coverage:
   - Add edge-case tests (e.g., minimum player count, seeded RNG producing predictable order) to the player generator suite.
   - Ensure game generator tests still cover summary alignment and event integrity after the refactor.
2. Update documentation:
   - Cross-reference `PLAYER_DATA_GENERATOR.md` within `GAME_DATA_GENERATOR.md` and any DevTools README to guide contributors to the shared module.
   - Note seeding and determinism usage for QA workflows in relevant docs.
3. Cleanup pass:
   - Remove any obsolete helper functions or TODOs left in the game generator after extraction.
   - Re-run repository-wide formatting/linting as needed.
4. **Validation:** Execute the full quality gate (`pnpm lint`, `pnpm test`, `pnpm typecheck`, and any Playwright smoke that covers DevTools generation).
5. **Commit:** `chore: finalize player generator rollout`.

---

## Release & Follow-Up

- Share the new helper with QA/dev tooling owners so future scripts adopt the shared module.
- Monitor for follow-up tasks from `PLAYER_DATA_GENERATOR.md` open questions (e.g., localized registries, multi-roster scenarios).
