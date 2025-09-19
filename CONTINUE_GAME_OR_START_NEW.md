# Continue Game Or Start New

## Purpose

- Provide a single, bullet-proof decision flow that preserves in-progress data, archives completed sessions, and prevents silent loss of work when a player initiates a new game.
- Align every entry point (scorecard, single-player, future multiplayer, admin tools) to the same confirmation, archival, and reset pipeline.
- Document state persistence mechanics so new implementations reuse the existing event-store guarantees instead of inventing ad-hoc resets.

## Current "Start New Game" Entry Points

- Single-player game summary CTA – `components/views/SinglePlayerMobile.tsx:205` renders `SpGameSummary` and currently calls `archiveCurrentGameAndReset()` directly when the player taps **Play Again**.
- Games dashboard – `/games` route (`app/games/page.tsx:43`) exposes a **New Game** button that archives/reset without any guard.

Everything funnels through `lib/state/io.ts:316` (`archiveCurrentGameAndReset`) which is the canonical archival + reset routine. Any new entry point must use the same helper.

## Persisted State Primer

- The active match is event-sourced in IndexedDB (`app-db`). `StateProvider` (`components/state-provider.tsx:64`) streams the event log, keeps the current height, and seeds the default roster on a pristine database (`components/state-provider.tsx:155`).
- `archiveCurrentGameAndReset` exports the bundle, writes an immutable snapshot into the `games` store, re-seeds the live DB with a fresh session seed plus `player/added` events, and broadcasts reset signals for multi-tab consistency (`lib/state/io.ts:316-432`).
- Because everything is driven by events, “continuing” simply means leaving the log untouched; “starting new” **must** call the archive helper so all tabs reset in lock-step.

## Detecting "In-Progress" Games

We need a shared predicate that answers “does abandoning right now throw away user work?”. Suggested heuristics combine scorecard and single-player signals:

```ts
import type { AppState } from '@/lib/state';

export function hasInProgressGame(state: AppState): boolean {
  const anyScores = Object.values(state.scores).some((score) => score !== 0);
  const anyRoundActivity = Object.values(state.rounds).some((round) => {
    if (!round) return false;
    // Locked rounds with zero bids/made are safe to ignore
    if (round.state === 'locked') return false;
    const bids = Object.values(round.bids ?? {});
    const made = Object.values(round.made ?? {});
    return bids.some((b) => b != null && b !== 0) || made.some((m) => m != null);
  });
  const spPhase = state.sp.phase;
  const spActive =
    spPhase !== 'setup' &&
    spPhase !== 'game-summary' &&
    spPhase !== 'done' &&
    (state.sp.trickPlays.length > 0 || Object.keys(state.sp.hands ?? {}).length > 0);
  return anyScores || anyRoundActivity || spActive;
}
```

Notes:

- Default roster seeding produces four `player/added` events at height 4, so height alone is a noisy signal; the predicate intentionally looks at bids, made markers, and SP phase instead.
- When we extend multiplayer, add checks for lobby/handshake state once those models land.

## Recommended Flow

1. **Centralize the action**: expose a `useNewGameRequest` (or module-level `requestNewGame`) helper that wraps `hasInProgressGame`, confirmation UI, and the archival call. Every UI surface imports this instead of reaching for `archiveCurrentGameAndReset` directly.
2. **Confirmation dialog**: if `hasInProgressGame(state)` is true, show a modal with context:
   - Title: “Start a new game?”
   - Body: “You have an in-progress game. Starting a new game will archive the current session and reset scores.”
   - Actions: **Continue current game** (close modal), **Archive & start new** (proceed).
   - Optional: surface last save timestamp using `height`/`state` metadata if we decide to store it.
3. **Execution**:
   - Disable the confirm button while awaiting `archiveCurrentGameAndReset()` to guard against double taps (pattern already used by `isBatchPending` handlers in `SinglePlayerMobile`).
   - After success, redirect or tee up any per-mode initialization (e.g., push `/single-player`, focus first control).
   - Handle errors with a toast and leave the current game intact.
4. **No progress detected**: skip confirmation and call `archiveCurrentGameAndReset()` directly, but still reuse the centralized helper so analytics/telemetry stays in one place.

### Pseudocode Helper

```ts
import { useCallback, useState } from 'react';
import { useAppState } from '@/components/state-provider';
import { archiveCurrentGameAndReset } from '@/lib/state';

export function useNewGameRequest() {
  const { state } = useAppState();
  const [pending, setPending] = useState(false);

  const startNewGame = useCallback(async () => {
    if (pending) return;
    const needsConfirm = hasInProgressGame(state);
    if (needsConfirm) {
      const confirmed = await showConfirmDialog({
        title: 'Start a new game?',
        description: 'Archive the current session and reset scores?',
        confirmLabel: 'Archive & start new',
      });
      if (!confirmed) return false;
    }
    try {
      setPending(true);
      await archiveCurrentGameAndReset();
      return true;
    } finally {
      setPending(false);
    }
  }, [pending, state]);

  return { startNewGame, pending };
}
```

UI layers can then wire `startNewGame` to buttons, and optionally inspect the boolean return value to decide whether to navigate.

## Applying the Helper Across Surfaces

- **Single-player summary** (`components/views/SinglePlayerMobile.tsx:205`): inject the hook, and allow **Play Again** to skip confirmation only when `state.sp.phase === 'game-summary' || state.sp.phase === 'done'`. If the player opens the menu mid-round (future UI) the shared guard still protects progress.
- **Games dashboard** (`app/games/page.tsx:43`): replace the bare call with the helper so the “New Game” button confirms when there is active progress (e.g., the player navigated to `/games` mid-hand).
- **Scorecard / future nav items**: whenever we add a toolbar action like “New Match” on the scorecard or multi-player lobby, consume the same helper.
- **Devtools / scripts**: expose a `window.__START_NEW_GAME__` in development that also routes through the helper for parity during manual testing.

## Edge Cases & Safeguards

- **Archival failure**: the helper should bubble surfaced error codes from `archiveCurrentGameAndReset` (e.g., `archive.reset_failed`). Show a toast and keep the modal open so the player can retry.
- **Multi-tab concurrency**: `archiveCurrentGameAndReset` already fires `localStorage` + `BroadcastChannel` signals (`lib/state/io.ts:410-431`). Ensure the confirmation modal closes on `reset` events so satellite tabs don't retain stale UI.
- **Time-travel in Devtools**: the devtools slider changes the preview state but not the persisted `height`. Always run the predicate against the live state (`timeTravelHeight === null`) so we don’t mistake a rewound preview for real progress.
- **Autogenerated rosters**: when the helper resets a truly fresh install (no events yet), the seeding effect in `StateProvider` (`components/state-provider.tsx:155-182`) immediately recreates default players. That’s expected; the confirm dialog should not show because the predicate returns false.
- **Mode-specific cleanup**: Single-player bots may have pending `appendMany` batches. The helper should respect `isBatchPending` before allowing a reset, mirroring how `Play Again` already guards with `isBatchPending`.

## Testing Checklist

- Unit-test `hasInProgressGame` with representative states (fresh DB, mid-round, completed match, SP hand in progress).
- Interaction tests:
  - Single-player: finish a game, choose **Play Again**, ensure archive is called once and new seed events appear.
  - Scorecard mid-round: click **New Game**, confirm modal appears, cancel keeps scores, confirm archives and resets to round 1 locked state.
  - Multi-tab: start new in tab A, verify tab B receives reset and no stale confirmation hangs.
- Regression tests for archival failure handling (simulate IndexedDB error, ensure warning surface + no partial reset).

## Next Steps

1. Implement `hasInProgressGame` and `useNewGameRequest` (or equivalent module) under `lib/game-flow/`.
2. Replace direct uses of `archiveCurrentGameAndReset` in the UI with the new helper.
3. Add shared confirmation UI (ShadCN dialog or native confirm fallback) styled consistently with the rest of the app.
4. Backfill automated coverage listed above so future entry points continue to respect the guard.

Following this plan keeps save data intact, makes the UX predictable, and ensures every new game request—no matter where it originates—funnels through the same hardened pipeline.
