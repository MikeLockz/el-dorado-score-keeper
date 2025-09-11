# Improve Single‑Player Hand Reveal (Design + Steps)

Goal: after each completed hand in single‑player, keep all played cards visible, highlight the winner, and require an explicit Continue button to proceed. If it was the last hand of the round, Continue advances to the next round. This gives players time to see the full hand before play continues.

This document proposes minimal, well‑scoped changes that fit the current SP engine, state, and UI.

Terminology: In the UI, we use “hand” for what the engine/state call a “trick”. Each hand results in one trick taken. A round contains multiple hands.

## Summary of Changes

- Add a small "reveal" sub‑state for the current hand: stores the winning player and keeps the hand visible.
- Change engine/hook to show the reveal instead of auto‑clearing after a timeout.
- Add an explicit Continue button in the UI that clears the hand, updates leader, and either starts the next hand or advances the round when the last hand is completed.
- Keep batching semantics (`appendMany`) to avoid UI flicker and ensure idempotency.

## State & Events

Add two new SP events and a tiny piece of state.

- New events
  - `sp/trick/reveal-set { winnerId: string }`
  - `sp/trick/reveal-clear {}`
- State shape additions (`AppState.sp`)
  - `reveal?: { winnerId: string } | null`

Validation: extend `lib/state/validation.ts` schema.

```ts
// lib/state/validation.ts
' sp/trick/reveal-set': z.object({ winnerId: id }),
' sp/trick/reveal-clear': z.object({}),
```

Reducer: handle set/clear, keep current hand plays visible until explicit clear.

```ts
// lib/state/types.ts (within reducer switch)
case 'sp/trick/reveal-set': {
  const { winnerId } = event.payload as EventMap['sp/trick/reveal-set'];
  return { ...state, sp: { ...state.sp, reveal: { winnerId } } };
}
case 'sp/trick/reveal-clear': {
  if (!state.sp.reveal) return state; // idempotent
  return { ...state, sp: { ...state.sp, reveal: null } };
}
```

Selectors (co‑locate with SP selectors):

```ts
// lib/state/selectors-sp.ts
export const selectSpReveal = (s: AppState) => s.sp.reveal ?? null;
export const selectSpIsLastTrick = (s: AppState) => {
  const needed = selectSpTricksForRound(s);
  const total = Object.values(s.sp.trickCounts ?? {}).reduce((a, n) => a + (n ?? 0), 0);
  return needed > 0 && total + 1 === needed;
};
```

Notes
- We do not snapshot the plays; the current hand remains visible in `sp.trickPlays` until `sp/trick/cleared` fires, so the UI can render them.
- Idempotency: `reveal-clear` is a no‑op when nothing is revealed.

## Engine Changes

Change hand resolution to set reveal instead of auto‑clearing. Keep trump‑broken semantics.

```ts
// lib/single-player/engine.ts
export function resolveCompletedTrick(state: AppState): AppEvent[] {
  const phase = state.sp.phase;
  if (phase !== 'playing') return [];
  const order = state.sp.order ?? [];
  const plays = state.sp.trickPlays ?? [];
  const trump = state.sp.trump;
  if (!trump || plays.length === 0) return [];
  if (plays.length < order.length) return [];
  // Already revealing? do nothing (idempotent)
  if (state.sp.reveal) return [];

  const winner = winnerOfTrick(
    plays.map((p, i) => ({ player: p.playerId as string, card: p.card as any, order: i })),
    trump,
  );
  if (!winner) return [];

  const ledSuit = plays[0]?.card?.suit as any;
  const anyTrump = plays.some((p) => (p.card as any)?.suit === trump);
  const batch: AppEvent[] = [];
  if (!state.sp.trumpBroken && anyTrump && ledSuit && ledSuit !== trump) {
    batch.push(events.spTrumpBrokenSet({ broken: true }));
  }
  // Only set reveal here; clearing and leader set are deferred until the user presses Continue
  batch.push(events.spTrickRevealSet({ winnerId: winner }));
  return batch;
}
```

Bot play should not run while a reveal is showing:

```ts
// lib/single-player/engine.ts
export function computeBotPlay(state: AppState, playerId: string, rng?: () => number): AppEvent[] {
  if (state.sp.phase !== 'playing') return [];
  if (state.sp.reveal) return []; // pause during reveal
  // ...existing logic...
}
```

## Hook Changes

Replace the auto‑clear effect with a reveal effect, and gate bot play while revealing.

- Keep the existing bidding prefill effect.
- Bot effect already checks `phase !== 'playing'`; add `if (state.sp.reveal) return;`.
- Trick resolution effect: dispatch `resolveCompletedTrick(state)` after a short delay (e.g., 300–500ms) to allow the last card animation to settle, but do not clear the trick.
- Remove any effect that auto‑emits `sp/trick/cleared` + `sp/leader-set`.

```ts
// lib/single-player/use-engine.ts (snippets)
// Bot plays
if (phase !== 'playing' || !hasDeal || isBatchPending || isRoundDone) return;
if (state.sp.reveal) return; // pause while revealing last trick

// Trick resolution -> reveal
if (phase !== 'playing' || !hasDeal || isBatchPending) return;
const batch = resolveCompletedTrick(state);
if (batch.length === 0) return;
const t = setTimeout(() => void appendMany(batch), 400);
```

Finalization effect stays as‑is; it will run after Continue clears the final trick.

## UI Changes

Location: `app/single-player/page.tsx` (or shared component it uses to render the hand area).

- Render the hand area from `sp.trickPlays` as today.
- When `selectSpReveal(state)` returns `{ winnerId }`:
  - Highlight the winning play (e.g., ring/glow around the winner’s card or seat).
  - Disable further play inputs.
  - Show a primary button:
    - Label: `Next Round` when `selectSpIsLastTrick(state)` is true; otherwise `Next Hand`.
    - On click, dispatch a single batch:

```ts
const onContinue = () => {
  const reveal = selectSpReveal(state);
  if (!reveal) return;
  const winnerId = reveal.winnerId;
  const isLast = selectSpIsLastTrick(state);
  const batch: AppEvent[] = [
    events.spTrickCleared({ winnerId }),
    events.spLeaderSet({ leaderId: winnerId }),
    events.spTrickRevealClear({}),
  ];
  if (isLast) {
    // Option A: rely on finalize effect (simpler, current hook covers this)
    // void appendMany(batch);

    // Option B (recommended for snappier UX): include finalize in one batch using current state
    // predict last-trick condition via `isLast` and append finalize batch now
    const finalize = finalizeRoundIfDone(
      // IMPORTANT: `finalizeRoundIfDone` uses state; but we know we’re on the last trick.
      // It expects trickCounts to include the last trick. Two options:
      // 1) Call appendMany(batch) first, then engine effect finalizes automatically (simple)
      // 2) Compute finalize using a cheap projected state or a variant that accepts overrides
      state,
    );
    batch.push(...finalize);
  }
  void appendMany(batch);
};
```

Notes
- If using Option A, the existing `use-engine` finalization effect will catch the completed round right after the batch is appended; label still reads `Next Round` and UX is correct.
- Keep control disabled while a batch is pending (`isBatchPending === true`).
- Accessibility: focus the Continue button when reveal appears; announce winner via an `aria-live="polite"` region.

## Styling / Highlighting

- Winner highlight: add a ring/border class to the player’s trick slot or the winning card. A simple implementation is to compare each `trickPlay.playerId` to `reveal.winnerId`.
- Ensure color contrast meets WCAG AA; keep it consistent with the app’s design system.

## Tests

Unit tests:
- Reducer: `sp/trick/reveal-set` stores winner; `sp/trick/reveal-clear` removes it; idempotency on double clear.
- Engine: `resolveCompletedTrick` yields reveal batch (and trump-broken when off‑suit trump is present) and does not emit clear/leader.
- Engine: `computeBotPlay` returns `[]` when `reveal` is set.

UI / integration tests:
- Play through one trick: after the last card, reveal appears with the winner highlighted and Continue enabled.
- Clicking Continue (non‑last trick) clears trick, sets leader, hides reveal, and next hand starts.
- Clicking Continue on final trick advances to next round (either via immediate finalize or effect‑based finalize), with bids for the next round visible.

## Migration & Backwards Compatibility

- New events are additive; existing SP flows continue to work. Auto‑clear paths are removed in favor of explicit reveal.
- Archived sessions without `sp.reveal` load fine; UI safely treats `reveal` as null when absent.

## Rollout Steps

1) Add validation entries for the two new events.
2) Update reducer for `reveal` set/clear.
3) Update engine `resolveCompletedTrick` to emit `sp/trick/reveal-set` instead of clear/leader.
4) Gate bot play on reveal.
5) Adjust hook effects (remove auto‑clear, add reveal effect timing).
6) Update UI to render reveal state and Continue button; wire handler as described.
7) Add tests for reducer/engine/UI.

## Rationale

- Minimal surface area: two new events and a small `sp.reveal` field, no breaking changes to existing scoring or phases.
- Preserves event‑sourced model with batched transitions to prevent flicker.
- Puts control in the player’s hands, meeting the user need to see every trick before proceeding.

---

This plan adds a clear, explicit reveal step per hand that keeps all cards visible, highlights the winner, and advances deterministically to the next hand or next round via a single button.
