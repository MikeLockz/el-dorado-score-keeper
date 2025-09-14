**Single-Player Code Review**

This review covers the single-player implementation across `lib/single-player/*`, `lib/state/*` (SP-related portions), and the SP UI in `app/single-player/page.tsx` and `components/views/SinglePlayerMobile.tsx`. It highlights opportunities to improve readability, maintainability, and performance, with concrete refactors and examples.

**High-Impact Improvements**

- **Unify Rules Logic:** Two rule modules exist with overlapping semantics:
  - `lib/single-player/rules.ts` (`isLegalPlay`, `canLead`) and
  - `lib/state/spRules.ts` (`canPlayCard`, `mustFollowSuit`, `canLeadTrump`, `isRoundDone`, `nextToAct`).
    These can drift over time and introduce subtle desyncs between UI checks and engine logic. Consolidate into a single canonical rules module (e.g., `lib/rules/sp.ts`) that exposes one API used by UI, engine, and selectors.

  Example consolidation surface:
  - `nextToAct`, `isTrickComplete`, `isRoundDone`
  - `canLeadTrump`, `mustFollowSuit`, `canPlayCard`
  - Optional stateless helpers: `ledSuitOf`, `trickHasTrump`

  Example (new canonical module):

  ```ts
  // lib/rules/sp.ts
  export { nextToAct, isRoundDone, canPlayCard } from '@/lib/state/spRules';
  export { ledSuitOf, trickHasTrump } from '@/lib/single-player/trick';
  ```

  Then replace imports from `spRules` or `single-player/rules` with `lib/rules/sp` throughout. This removes duplication without a risky rewrite.

- **Single Source of Truth for Next-Round Deal Batches:** The code that builds the “next round” deal batch is duplicated in both `computeAdvanceBatch` and `finalizeRoundIfDone` (and also in `app/single-player/page.tsx:onDeal`). Extract a helper to construct this batch once.

  Example helper:

  ```ts
  // lib/single-player/engine.ts (new helper)
  export function buildNextRoundDealBatch(
    state: AppState,
    now: number,
    useTwoDecks?: boolean,
  ): AppEvent[] {
    const ids = selectPlayersOrdered(state).map((p) => p.id);
    const curDealerId = state.sp.dealerId ?? ids[0]!;
    const curIdx = Math.max(0, ids.indexOf(curDealerId));
    const nextDealer = ids[(curIdx + 1) % ids.length]!;
    const nextRound = (state.sp.roundNo ?? 0) + 1;
    const nextTricks = tricksForRound(nextRound);
    const twoDecks = useTwoDecks ?? ids.length > 5;
    const seed = now;
    const deal = startRound(
      {
        round: nextRound,
        players: ids,
        dealer: nextDealer,
        tricks: nextTricks,
        useTwoDecks: twoDecks,
      },
      seed,
    );

    return [
      events.spDeal({
        roundNo: nextRound,
        dealerId: nextDealer,
        order: deal.order,
        trump: deal.trump,
        trumpCard: { suit: deal.trumpCard.suit, rank: deal.trumpCard.rank },
        hands: deal.hands,
      }),
      events.spLeaderSet({ leaderId: deal.firstToAct }),
      events.spPhaseSet({ phase: 'bidding' }),
      events.roundStateSet({ round: nextRound, state: 'bidding' }),
    ];
  }
  ```

  - In `computeAdvanceBatch` and `finalizeRoundIfDone`, call `buildNextRoundDealBatch` instead of re-implementing. This reduces bugs, improves readability, and makes future changes (e.g., extra metadata) trivial.

- **RNG Duplication:** `app/single-player/page.tsx` re-implements mulberry32 while `lib/single-player/rng.ts` already exports it. Reuse `mulberry32` and consider a tiny hook for consistent setup.

  Example:

  ```ts
  // app/single-player/page.tsx
  import { mulberry32 } from '@/lib/single-player';

  const [seed, setSeed] = React.useState<string>(() => String(Date.now() % 1_000_000_000));
  const rngRef = React.useRef<() => number>(() => Math.random());
  React.useEffect(() => {
    rngRef.current = mulberry32(Number(seed) | 0);
  }, [seed]);
  ```

  Add `useDeterministicRng(seed)` in `lib/single-player` to encapsulate this pattern.

- **Engine Phase Consistency:** `finalizeRoundIfDone` sets `spPhaseSet('done')` before optionally starting the next round, while `computeAdvanceBatch` sets `'summary'` and manages timing/advance. This is confusing and risks phase churn or timing races. Prefer a single pathway for end-of-round transitions:
  - Let `computeAdvanceBatch` own summary entry and timed/user advance.
  - Limit `finalizeRoundIfDone` to a pure scoring finalization after reveal is cleared, without intermediate `'done'` phase, or remove it if entirely redundant.

  Example change (conceptual):
  - Remove the intermediate `'done'` write from `finalizeRoundIfDone`.
  - Or gate its use strictly to server-side persistence needs and keep UI-driven flow in `computeAdvanceBatch`.

**UI Structure and Modularity**

- **Component Decomposition:** `SinglePlayerMobile.tsx` is large and intermixes orchestration, presentation, and input rules. Split into focused components:
  - `SpHeaderBar` (trump, dealer, hand counter)
  - `SpTrickTable` (compact table of bids/tricks/current plays)
  - `SpHandDock` (grouped hand, selection, play logic)
  - `SpRoundSummary` and `SpGameSummary` (dedicated screens)
    This improves readability, testability, and makes prop/selector boundaries clearer.

  Example skeleton:

  ```tsx
  // components/views/sp/SpTrickTable.tsx
  export function SpTrickTable({ rotated, overlay, reveal, roundNo, trickCounts }: Props) {
    /* ... */
  }

  // components/views/sp/SpHandDock.tsx
  export function SpHandDock({ humanId, trump, hands, onPlay }: Props) {
    /* ... */
  }
  ```

- **Centralize Play Legality:** `SinglePlayerMobile` duplicates legality checks in `canPlayCard`. Use the canonical rules function instead of re-implementing UI-side logic.

  Example replacement:

  ```ts
  import { canPlayCard as rulesCanPlay } from '@/lib/rules/sp';

  const canPlayCard = (c: SpCard) => {
    if (spPhase !== 'playing' || state.sp?.reveal) return false;
    const ok = rulesCanPlay(
      {
        order: spOrder,
        leaderId: sp?.leaderId,
        trickPlays: sp?.trickPlays ?? [],
        hands: spHands,
        trump: spTrump!,
        trumpBroken: !!sp?.trumpBroken,
      },
      humanId,
      { suit: c.suit, rank: c.rank },
    );
    return ok.ok;
  };
  ```

- **Avoid Recomputing Advance Batch Multiple Times per Render:** The primary CTA computes `computeAdvanceBatch(state, Date.now(), { intent: 'user' })` three times. Compute once with `useMemo` and reuse.

  Example:

  ```ts
  const advanceBatch = React.useMemo(() =>
    computeAdvanceBatch(state, Date.now(), { intent: 'user' }), [state]
  );

  const disabled = advanceBatch.length === 0;
  <button disabled={disabled} aria-disabled={disabled} onClick={() => {
    if (!disabled) void appendMany(advanceBatch);
  }}>Continue</button>
  ```

- **Remove Dead Local State:** `app/single-player/page.tsx` keeps `playersCount` that isn’t used and some early-planning local state. Remove unused state to reduce cognitive load.

**Types and Naming**

- **Align Card Types to Avoid `any` Casts:** `page.tsx` and `SinglePlayerMobile.tsx` cast SP cards with `as any as Card`. Tighten `AppState.sp` types to use the same `Rank` discriminated union and `Suit` as SP types (or share a common `Card` type). This will remove casts and reduce mistakes.

  Example (narrow AppState’s SP card rank to `Rank`):

  ```ts
  // lib/state/types.ts
  import type { Rank, Suit } from '@/lib/single-player/types';
  // ...
  trumpCard: { suit: Suit; rank: Rank } | null;
  hands: Record<string, Array<{ suit: Suit; rank: Rank }>>;
  trickPlays: Array<{ playerId: string; card: { suit: Suit; rank: Rank } }>;
  ```

- **Consistent Phase Literals:** Centralize SP phase strings in a union type or const enum exported from a common module to prevent typos and ease refactors.

  Example:

  ```ts
  // lib/single-player/phases.ts
  export type SpPhase = 'setup' | 'bidding' | 'playing' | 'summary' | 'game-summary' | 'done';
  export const SP_PHASE = {
    setup: 'setup',
    bidding: 'bidding',
    playing: 'playing',
    summary: 'summary',
    gameSummary: 'game-summary',
    done: 'done',
  } as const;
  ```

**Engine and Effects**

- **Effect Boundaries / Ownership:** `useSinglePlayerEngine` handles bot bidding, bot play, trick resolution, and round finalization; `SinglePlayerMobile` also uses `computeAdvanceBatch` timer and CTA. Keep ownership clear:
  - Engine: deterministic transitions and batch creation; idempotent where possible.
  - UI: presenting state and issuing high-level intents (advance, bid, play card).
    Move auto-advance countdown state to a tiny hook that reads `sp.summaryEnteredAt` and yields remaining time and a boolean for “should auto-advance now.”

- **Idempotency Checks:** Great use of idempotency in reducers (`sp/trick/played` ignoring duplicates, reveal gating). Keep this consistent when consolidating rule and advance logic.

**Performance**

- **Selector Use is Good:** SP selectors (`selectors-sp.ts`) are memoized and used broadly. Prefer selectors over re-deriving in components.
- **Render-Time Computations:** Memoize derived values used multiple times in a render (e.g., `advanceBatch`, `rotated`, `overlay` if heavy). Avoid inline function re-creation for leaf child props where it harms perf.
- **Lazy-load Bots:** If bundle size matters on mobile, consider dynamic import for bot strategy only when phase enters `'bidding'` or `'playing'` in SP mode.

**Testing**

- **Deterministic Bot + Rules Tests:** With `mulberry32`, add tests to ensure:
  - Given fixed seed and hands, bots produce stable bids and plays.
  - `canPlayCard` disallows trump lead when not broken and non-trump exists; requires following suit when possible.
  - End-to-end trick resolution and round summary correctness for edge cases (last trick, trump broken on off-suit, etc.).

**Smaller Polishes**

- **Event `ack` Usage:** Rename to awaitingAck: boolean and actually use it to enable/disable the primary CTA during
  reveal.
- **Naming Consistency:** Prefer `nextToAct` consistently over `selectSpNextToPlay` and `spRules.nextToAct` naming divergence, or re-export to harmonize names.
- **Remove Transitional Logging/Comments:** Clean up commented code (`// import CurrentGame`, legacy notes) to reduce noise.

**Summary of Suggested Changes**

- Consolidate SP rules to eliminate duplication and drift.
- Extract a reusable `buildNextRoundDealBatch` and reuse in engine/UI.
- Use the shared RNG implementation; add a tiny hook for setup.
- Normalize round-finalization and summary phases to a single pathway.
- Split `SinglePlayerMobile` into smaller components; centralize play-legality checks.
- Tighten types to remove `any` casts; unify `Card`/`Rank`/`Suit` usage.
- Memoize repeated compute calls in render; consider lazy-loading bot logic.
- Add deterministic tests for rules/bots.

These changes reduce duplication, lower the chance of state/logic drift, and make the SP code easier to evolve and test.
