**Reproducible Deals (Single‑Player)**

- **Goal:** Full‑session reproducibility across all rounds from a single base seed. Given identical inputs (roster order, dealer rotation, rules version, options), the app produces identical shuffles, trump flips, bot bids/plays, and round outcomes.

**Current State**

- **Deal RNG:** `dealRound(cfg, seed)` uses a deterministic PRNG (`mulberry32`) when a numeric `seed` is passed. If `seed` varies, the shuffle varies.
- **Where seeds come from:**
  - `app/single-player/page.tsx` calls `startRound(..., Date.now())` for deals, so each deal is time‑seeded → non‑reproducible.
  - The page maintains a local `seed` and `rngRef` to seed bot behavior, but this does not influence the deal seed.
  - `lib/single-player/engine.ts` uses `now = Date.now()` for next‑round deals.
- **Docs signal:** `docs/SINGLE_PLAYER_STATE_IMPROVEMENTS.md` references adding `sp/seed-set` to record a session seed.

**Design Overview**

- **Session seed:** Persist a single numeric `sessionSeed` on the SP state. It never changes within a session.
- **Round seeds:** Derive a per‑round seed deterministically from `sessionSeed` and the round number. Do not use wall‑clock time for any shuffle.
- **Bots RNG:** Feed bots a deterministic RNG derived from the same session seed so their stochastic choices are reproducible too. Use a distinct derivation stream to avoid coupling to shuffle draws.
- **Deterministic inputs:** Reproducibility holds only if seat order, dealer progression, rules/options, and user inputs are the same. Changing roster order or skipping players breaks parity by design.

**Seed Derivation**

- Add a small helper to derive 32‑bit seeds from a base:
  - `deriveSeed(base: number, round: number, stream = 0): number`
  - Implementation: 32‑bit mix with constants; example below.
- Use separate `stream` indices to avoid cross‑coupling sequences:
  - `stream 0` → card shuffles (deal)
  - `stream 1` → bot logic RNG per round (bids/plays that sample RNG)

**Code Changes**

- lib/state/types.ts
  - Add optional `sessionSeed?: number | null` to `sp` slice type.

- lib/state/events.ts and reducers handling
  - Add new event: `sp/seed-set` with payload `{ seed: number }`.
  - Reducer: set `state.sp.sessionSeed = payload.seed` (leave unchanged if already set and you want immutability; or allow overwrite from UI explicitly).

- lib/single-player/seed.ts (new)
  - Export `deriveSeed(base: number, round: number, stream = 0): number`.
  - Reference implementation:
    - `const GOLDEN = 0x9e3779b9;`
    - `let x = (base ^ (round + 1) * GOLDEN) >>> 0;`
    - `x ^= (stream + 1) * 0x85ebca6b;`
    - `x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;`
    - `return x >>> 0;`

- app/single-player/page.tsx
  - Source `sessionSeed` from app state instead of a local component state string.
  - Provide a simple input to set it (UI already mentions a seed in docs): when user sets/edits seed, dispatch `events.spSeedSet({ seed: Number(value) })`.
  - Replace `startRound(..., Date.now())` with:
    - `const roundSeed = deriveSeed(sessionSeed ?? Date.now(), spRoundNo, 0);`
    - `const deal = startRound(cfg, roundSeed);`
  - Replace bot RNG init to use a deterministic source tied to the same session seed but separate from shuffle stream:
    - `rngRef.current = mulberry32(deriveSeed(sessionSeed ?? 0, spRoundNo, 1));`
    - Optionally, keep a single session‑wide bot RNG: `mulberry32(deriveSeed(sessionSeed ?? 0, 0, 1))` if you prefer continuity across rounds. Either is deterministic; per‑round is easier to reason about.

- lib/single-player/engine.ts
  - In `buildNextRoundDealBatch` and any first deal logic, stop using `now = Date.now()` for seeding. Instead read `const base = state.sp.sessionSeed ?? now;` and then:
    - `const seed = deriveSeed(base, nextRound, 0);`
  - Keep `now` only for timestamps; do not feed it into shuffle.

- lib/single-player/round.ts and lib/single-player/deal.ts
  - No changes required; they already accept an explicit `seed` and use `mulberry32`.

**Minimal Patches (by file)**

- Add event and state
  - `lib/state/events.ts`:
    - Add to type union and event factory: `spSeedSet: (p: { seed: number }, m?: Meta) => makeEvent('sp/seed-set', p, m)`.
  - `lib/state/reducer.ts` (or wherever SP reducer lives):
    - Handle `'sp/seed-set'` to set `state.sp.sessionSeed`.
  - `lib/state/INITIAL_STATE.ts`:
    - Initialize `sp.sessionSeed` to `null`.

- Seed derivation utils
  - `lib/single-player/seed.ts` with `deriveSeed` as noted above.
  - Re‑export from `lib/single-player/index.ts` for convenience.

- Wire deals to derived seeds
  - `app/single-player/page.tsx`:
    - Import `deriveSeed` and use it in `onDeal()` and in the auto‑deal effects.
    - Replace bot RNG init to use `deriveSeed` instead of the local `seed` state.
    - Remove or repurpose the component’s local `seed` state in favor of the store’s `sessionSeed`.

- Engine next‑round deal
  - `lib/single-player/engine.ts`:
    - In `buildNextRoundDealBatch`, derive `seed` from `state.sp.sessionSeed` via `deriveSeed(base, nextRound, 0)`.

**Testing**

- tests/unit/sp-rng-wireup.test.ts
  - Add a case asserting that for a fixed `sessionSeed` and same inputs, two full rounds produce identical `sp/deal` events (hands, trump, order) and that different `sessionSeed` produces a difference.

- tests/property/single-player-rules-property.test.ts
  - Derive seeds via `deriveSeed` rather than hardcoding `mulberry32(0xc0ffee)` to align with the derivation path.

**Migration / Backward Compatibility**

- If `sessionSeed` is absent (old sessions), fall back to `Date.now()` for seed derivation so existing behavior remains unchanged.
- Persist `sessionSeed` in any archive/export flows. `lib/state/io.ts` already has an archive setup; include an early `sp/seed-set` event when creating/importing archives so replays are identical.

**Developer Notes**

- Avoid using the same RNG for both shuffles and bots to prevent subtle coupling: a slightly different play path could shift bot RNG consumption and change future deals if they shared a generator.
- Keep seed derivation stable. If you ever need to change the derivation, bump a `rulesVersion` or a `seedVersion` and include it in the mix to avoid silent drift in historical replays.

**Status**

- Implemented Phases 1–5:
  - Seed derivation util + tests
  - Session seed event/state + validation
  - Page wiring for deals/bots from `sessionSeed` (fallback‑safe)
  - Engine next‑round deal seeding from `sessionSeed`
  - Archive reset includes `sp/seed-set` before roster reseed

**Example Snippets**

- `lib/single-player/seed.ts`
  - `export function deriveSeed(base: number, round: number, stream = 0): number { /* mix as described */ }`

- `app/single-player/page.tsx`
  - `const base = state.sp.sessionSeed ?? Date.now();`
  - `const roundSeed = deriveSeed(base, spRoundNo, 0);`
  - `const deal = startRound(cfg, roundSeed);`
  - `rngRef.current = mulberry32(deriveSeed(base, spRoundNo, 1));`

This plan removes all time‑based seeding for shuffles and makes the entire single‑player run reproducible from a single persisted base seed.
