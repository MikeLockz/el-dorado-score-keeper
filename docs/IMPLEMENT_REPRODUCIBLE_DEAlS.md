**Implement Reproducible Deals**

- Purpose: Execute @REPRODUCIBLE_DEALS.md in phased, verifiable steps aligned with repo patterns. Each phase lands in small commits that pass format, lint, typecheck, and tests before proceeding.

**Conventions**

- Commands: use `pnpm <script>` or `npm run <script>` per your workflow.
- Quality gates per phase: `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`.
- Keep diffs scoped; do not refactor adjacent code outside the phase goal.

**Phase 1: Seed Derivation Utility**

- Changes
  - Add `lib/single-player/seed.ts` exporting `deriveSeed(base: number, round: number, stream = 0): number` per @REPRODUCIBLE_DEALS.md.
  - Re-export from `lib/single-player/index.ts`.
- Tests
  - `tests/unit/seed-derive.test.ts`:
    - Same inputs → same outputs; different round/stream/base → differs in at least one case.
    - Output is uint32 (0 <= n < 2^32).
- Quality gates
  - Run: `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`.
- Commit
  - Message: "sp: add deterministic seed derivation util and tests".

**Phase 2: Session Seed Event + State**

- Changes
  - `lib/state/types.ts`:
    - In `EventMap`, add `'sp/seed-set': { seed: number }`.
    - In `AppState.sp`, add optional `sessionSeed?: number | null` and default to `null` in `INITIAL_STATE`.
    - In `reduce`, handle `'sp/seed-set'` to set `sp.sessionSeed = Math.floor(seed)`.
  - `lib/state/events.ts`: add `spSeedSet` factory mapping to `'sp/seed-set'`.
  - `lib/state/validation.ts`: add zod schema for `'sp/seed-set'` with `{ seed: z.number().int() }`.
- Tests
  - `tests/unit/event-validation.test.ts` (or new): validate `'sp/seed-set'` passes schema and reducer persists value.
- Quality gates
  - Run: `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`.
- Commit
  - Message: "sp: add session seed to state and sp/seed-set event".

**Phase 3: Wire Deals to Derived Seeds (Page)**

- Changes
  - `app/single-player/page.tsx`:
    - Read `const base = state.sp.sessionSeed ?? Date.now();`.
    - Replace `startRound(..., Date.now())` with `startRound(cfg, deriveSeed(base, spRoundNo, 0))`.
    - Replace bot RNG init to use `mulberry32(deriveSeed(base, spRoundNo, 1))`.
    - Optional: If a seed input exists, repurpose it to dispatch `events.spSeedSet({ seed })` instead of only local state, preserving existing UX.
- Tests
  - Add a unit test for a thin wrapper utility if necessary; otherwise rely on Phase 4 engine tests for deterministic deals.
- Quality gates
  - Run: `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`.
- Commit
  - Message: "sp: derive page deals and bot RNG from session seed".

**Phase 4: Engine Next-Round Deal Determinism**

- Changes
  - `lib/single-player/engine.ts`:
    - In `buildNextRoundDealBatch`, stop using `Date.now()` for the shuffle seed.
    - Use `const base = state.sp.sessionSeed ?? now;` then `const seed = deriveSeed(base, nextRound, 0)`.
    - Keep `now` for timestamps only.
- Tests
  - `tests/unit/sp-engine-seeded-deal.test.ts`:
    - Seed minimal state with fixed `sessionSeed` and same players/order; call `buildNextRoundDealBatch` twice → identical `sp/deal` payloads.
    - Different `sessionSeed` → payload differs at least in one hand or `trumpCard`.
- Quality gates
  - Run: `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`.
- Commit
  - Message: "sp: derive engine next-round deal from session seed".

**Phase 5: Archive/Import Parity**

- Changes
  - `lib/state/io.ts` archive/export/import flows:
    - When creating a new SP archive/session snapshot, include an early `events.spSeedSet({ seed: <sessionSeed> })` if missing.
    - On restore, ensure `sessionSeed` is present in the reconstructed state (events already drive state).
- Tests
  - Integration test that archives with a given `sessionSeed` and replays produce identical `sp/deal` for a given round.
- Quality gates
  - Run: `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`.
- Commit
  - Message: "sp: persist session seed in archive/import for reproducible replays".

**Phase 6: Documentation + Guardrails**

- Changes
  - Update `docs/SINGLE_PLAYER.md` and `@REPRODUCIBLE_DEALS.md` references if any API names changed.
  - Add a short note in `docs/SINGLE_PLAYER_STATE_IMPROVEMENTS.md` pointing to the new `sp/seed-set` event and derivation strategy.
- Tests
  - N/A (docs), but re-run full suite to ensure no drift.
- Quality gates
  - Run: `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`.
- Commit
  - Message: "docs: single-player reproducible deals and session seed".

**Acceptance Criteria (Overall)**

- For fixed `sessionSeed` and same inputs (players/order/dealer/rules), the following are identical across runs:
  - `sp/deal.hands`, `sp/deal.trumpCard`, `sp.trump`, `sp.order`, and any bot choices that consume RNG.
- Changing `sessionSeed` or inputs changes at least one of the above deterministically.
- No part of the shuffle path depends on wall-clock time.
- Lint, typecheck, and tests pass; no broadened TypeScript `any` introduced.

**Rollback Plan**

- The derivation is isolated; toggling back to `Date.now()` seeds can be done by flipping calls at the page/engine boundaries if issues arise.
