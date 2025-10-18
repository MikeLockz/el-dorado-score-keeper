# Implement Game Data Generator

This guide breaks the work into executable phases that align with `GAME_DATA_GENERATOR.md`. Complete the steps in order, running validation as indicated, and create a commit after finishing each phase.

---

## Phase 1 – Schema & Infrastructure Audit

1. Review `lib/state/io.ts`, reducers, and schema definitions (`schema/`, `lib/types/`) to catalog:
   - `GameRecord` shape, including required summary fields.
   - Event payload contracts for `game/start`, `round/*`, `bid/*`, `score/*`, `summary/submit`.
   - IndexedDB stores touched during archive import/export (`app-games-db`, `app-db`).
2. Confirm source of the current single-player user metadata (likely selectors in `lib/state/user` or similar).
3. Document findings in `SCRATCH_PAD.md` or engineering notes if clarifications are needed.
4. **Validation:** Run type checks (`pnpm typecheck`) to ensure existing definitions compile.
5. **Commit:** `feat: audit game archive schemas` (include notes on key structures discovered).

---

## Phase 2 – Generator Library Foundations

1. Create a dedicated module, e.g., `lib/devtools/generator/gameDataGenerator.ts`.
2. Implement deterministic helper utilities:
   - `getRng(seed?: string)` returning seeded PRNG.
   - Name/UUID registry (10 three-letter names) with sampling helpers that reserve a slot for the current user.
3. Build roster generator:
   - Accept `playerCount`, `currentUser` metadata.
   - Return ordered roster matching seat expectations.
4. Prototype round descriptor generator:
   - Produce descending rounds starting at 10 with ±1 trick variance.
   - Generate bids meeting ±2 total variance requirement and behavioral distributions (zero bids, high bids).
   - Stub trick outcomes and score calculations (return typed structures, no reducer coupling yet).
5. **Validation:** Add unit tests under `tests/devtools/__tests__/gameDataGenerator.spec.ts` covering RNG determinism, roster inclusion of current user, bid totals.
6. **Commit:** `feat: scaffold game data generator utilities`.

---

## Phase 3 – Event & State Assembly

1. Extend generator to translate round descriptors into full event streams:
   - Emit ordered events with timestamps (use helper to increment by realistic intervals).
   - Ensure payloads match audited schemas.
2. Derive summary metadata (`GameRecord.summary`) and round tallies from generated data—skip scorecard-specific structures.
3. Package output as:
   ```ts
   export type GeneratedGamePayload = {
     gameRecord: GameRecord;
     events: Array<GameEvent>;
     roundTallies: RoundTallies;
   };
   ```
4. **Validation:** Expand unit tests to cover:
   - Event ordering and timestamp monotonicity.
   - Round/tally consistency (total tricks, bids).
   - Summary integrity (roundsCompleted, finalScores array length).
5. **Commit:** `feat: assemble synthetic game records`.

---

## Phase 4 – Persistence Integration

1. Add IndexedDB persistence helper in `lib/devtools/generator/saveGeneratedGame.ts`:
   - Reuse existing import/export utilities to write `gameRecord`, `events`, and tallies.
   - Explicitly bypass scorecard store writes.
2. Ensure helper triggers events/state updates used by archive list (e.g., dispatch `games/imported`).
3. Integrate RNG seeding (optional seed parameter, default random).
4. **Validation:** Write integration-like test (Vitest or Playwright component test) using an in-memory IndexedDB shim if available; otherwise ensure functions resolve without throwing by mocking persistence layer.
5. **Commit:** `feat: persist generated game archives`.

---

## Phase 5 – DevTools UI & QA Hooks

1. Update DevTools panel (likely `components/devtools/SinglePlayerDevTools.tsx`) to add “Generate Single Player Game” button.
2. Wire button click to new persistence helper; handle async state (loading, success, error).
3. Display success toast with generated game id and quick navigation.
4. Add optional seed input prop behind collapsible advanced section (future-ready but default hidden).
5. **Validation:**
   - Run lint, typecheck, unit tests.
   - Add Playwright smoke: click button, await success toast, navigate to archive view, confirm timeline renders.
6. **Commit:** `feat: add single player game generator tool`.

---

## Phase 6 – Final Verification

1. Manual QA checklist:
   - Confirm generated archive includes current user id.
   - Inspect IndexedDB via browser DevTools ensuring no synthetic markers.
   - Replay game via archive viewer without errors.
2. Gather screenshots/logs if anomalies appear.
3. **Commit:** `chore: validate game data generator rollout` (include documentation updates if any).

---

## Release & Follow-Up

- Update internal documentation (`docs/`) and tooling notes if the DevTools panel requires instructions.
- Coordinate with QA to incorporate the new generator into regression playbooks.
- Track open questions from `GAME_DATA_GENERATOR.md` and file tickets for follow-up items (variants, localization).
