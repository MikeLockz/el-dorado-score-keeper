# Single Player UI — Implementation Guide (Match the Mobile Prototype)

Goal: Update the single‑player view in the app to mirror the mobile layout and interactions in `experiments/mobile-single-player-prototype/index.html`, while reusing existing state, selectors, and engine logic.

This document is an implementation plan with concrete steps, file touch points, and code references to land a production‑quality version without diverging from current state/engine architecture.

## What We’re Matching

From `experiments/mobile-single-player-prototype/index.html` (plus `styles.css` and `script.js`), bring over these UI concepts:

- Ultra‑condensed top bar stats: Round, Hand, Tricks, Score, Delta, Trump, Trump Broken.
- Compact, always‑visible trick table: 4 rows, each shows Name, Bid, Tricks, Played card.
- Bottom sheet: collapsible (peek/mid/full) with Score, Delta, Bids, Trick Log, and secondary actions.
- Docked hand: fixed above an actions bar, cards in a compact row; tap to select, double‑tap to play.
- Actions bar: Details (opens sheet) and Finalize (confirm modal).
- Toasts and a simple confirm modal.

Notes vs prototype:

- Trump suit is determined by the deal; keep it read‑only (no suit cycling). Trump Broken is stateful; keep it toggleable via an event.
- Keep gameplay/state flows driven by the existing SP engine and events.

## Where To Work

- Primary: `app/single-player/page.tsx`
- Reuse: selectors and events from `lib/state` and `lib/state/selectors-sp.ts`
- Engine/hook: `lib/single-player/use-engine.ts` (unchanged; already orchestrates bidding/playing/finalize)
- UI atoms: `components/ui` (e.g., `CardGlyph`, `Button`)
- Optional (nice to have): small local components inside `app/single-player/` for Sheet, Toast, and Modal using Tailwind utilities.

No global CSS is required; implement styling with existing Tailwind classes. Respect safe‑area insets and prefers‑reduced‑motion where possible.

## Data & Selectors You’ll Need

Import from `lib/state` and `lib/state/selectors-sp.ts`:

- `selectPlayersOrdered(state)` — names for seats
- `selectSpRotatedOrder(state)` — table row order starting from current leader/lead
- `selectSpLiveOverlay(state)` — current plays and trick counts per seat
- `selectSpTrumpInfo(state)` — trump + trumpCard info
- `selectSpDealerName(state)` — dealer label
- `selectSpTricksForRound(state)` — target tricks for this round
- `selectSpHandBySuit(state, playerId)` — human hand grouped and sorted by suit
- `selectSpReveal(state)` and `selectSpIsLastTrick(state)` — for reveal/continue flow
- `events.spTrickPlayed`, `events.spTrumpBrokenSet` — interactive actions
- Scoring (for Score/Delta chips in the sheet):
  - `selectCumulativeScoresAllRounds(state)` — totals through scored rounds
  - `roundDelta(bid, made)` and `state.rounds[currentRound]` — per‑round deltas

## Implementation Steps

The steps below describe how to restructure `app/single-player/page.tsx` UI while keeping existing logic. You can stage this behind a feature flag if preferred.

### 1) Wrap the Page in a Mobile Shell

Replace the current desktop‑oriented layout with a mobile‑first scaffold:

- A sticky top bar (header)
- A main surface with compact table and the bottom sheet
- A fixed hand dock above a fixed actions bar

Suggested structure in JSX (high‑level only):

```tsx
return (
  <div className="min-h-dvh flex flex-col bg-background text-foreground">
    {/* Top bar */}
    <header className="sticky top-0 z-10 bg-card border-b px-2 py-1">
      {/* Stats line goes here */}
    </header>

    {/* Main surface: compact table + bottom sheet */}
    <main className="relative flex-1">
      {/* Compact trick table */}
      {/* Bottom sheet (peek/mid/full) */}
    </main>

    {/* Hand dock */}
    <section
      className="fixed left-0 right-0 z-20"
      style={{ bottom: 'calc(var(--safe-area-inset-bottom, 0px) + 52px)' }}
    >
      {/* Cards row */}
    </section>

    {/* Actions bar */}
    <nav
      className="fixed left-0 right-0 bottom-0 z-30 grid grid-cols-2 gap-2 px-2 py-2
                    border-t bg-background/85 backdrop-blur"
      style={{ minHeight: 52 }}
    >
      {/* Details + Finalize */}
    </nav>

    {/* Toast + Modal */}
  </div>
);
```

This mirrors the prototype’s stacking: header (z10), sheet (z30), hand (z20), actions (z30), toast/modal above.

### 2) Top Bar Stats (Round/Hand/Tricks/Score/Delta/Trump/Broken)

Compute values from state and render as compact chips/labels.

- Round/Hand:
  - `round = state.sp.roundNo`
  - `totalHands = selectSpTricksForRound(state)`
  - `handsCompleted = sum(state.sp.trickCounts)`
  - `handNow = handsCompleted + (state.sp.trickPlays?.length > 0 ? 1 : 0)`

- Tricks this round: `handsCompleted`

- Score & Delta for the human player (choose the human id from the control at top of the page; the current page already has `human`):
  - `totals = selectCumulativeScoresAllRounds(state)` then `score = totals[round]?.[human] ?? 0`
  - `delta` (for the sheet): from `state.rounds[round]` via `roundDelta(bid, made)`

- Trump suit/card: `selectSpTrumpInfo(state)`

- Trump Broken toggle: write `events.spTrumpBrokenSet({ broken: !state.sp.trumpBroken })`

Example snippet (minimal):

```tsx
const totalsByRound = React.useMemo(() => selectCumulativeScoresAllRounds(state), [state]);
const roundTotals = totalsByRound[spRoundNo] ?? {};
const humanScore = roundTotals[human] ?? 0;
const r = state.rounds[spRoundNo];
const humanBid = r?.bids?.[human] ?? 0;
const humanMade = r?.made?.[human] ?? null;
const humanDelta = humanMade == null ? 0 : roundDelta(humanBid, humanMade);

const handsCompleted = Object.values(spTrickCounts ?? {}).reduce((a, n) => a + (n ?? 0), 0);
const totalHands = selectSpTricksForRound(state);
const handNow = handsCompleted + (spTrickPlays.length > 0 ? 1 : 0);

const { trump, trumpCard } = selectSpTrumpInfo(state);

// Render compact labels/buttons similar to the prototype
// Use small type sizes and tight gaps for ultra-compact layout
```

For the “Trump” chip, show the suit symbol from `CardGlyph` or a small inline helper; do not allow changing suit. For the “Broken” chip, wire a click to toggle the flag event.

### 3) Compact Trick Table (4 rows)

Render a small grid showing, for each seat:

- Name (full or abbreviated)
- Bid (from `state.rounds[round].bids[pid]`)
- Tricks won so far (from `sp.trickCounts[pid]`)
- Card currently played (from `selectSpLiveOverlay(state).cards[pid]`)

Seat order: `selectSpRotatedOrder(state)` to keep the current leader at the top.

Example outline:

```tsx
const order = selectSpRotatedOrder(state);
const live = spPhase === 'playing' ? selectSpLiveOverlay(state) : null;

<div className="grid gap-1 p-2 pb-28">
  {' '}
  {/* leave room for hand/actions */}
  <div className="grid grid-cols-[minmax(64px,1fr)_36px_52px_64px] text-[10px] text-muted-foreground">
    <div>Player</div>
    <div>Bid</div>
    <div>Tricks</div>
    <div className="text-right">Card</div>
  </div>
  {order.map((pid) => {
    const name = activePlayers.find((p) => p.id === pid)?.name ?? pid;
    const bid = state.rounds[spRoundNo]?.bids?.[pid] ?? 0;
    const tricks = spTrickCounts?.[pid] ?? 0;
    const played = live?.cards?.[pid] ?? null;
    return (
      <div
        key={pid}
        className="grid grid-cols-[minmax(64px,1fr)_36px_52px_64px] items-center gap-1
                                 rounded bg-card/60 px-1 py-0.5"
      >
        <div className="truncate text-sm">{name}</div>
        <div className="text-sm tabular-nums text-center">{bid}</div>
        <div className="text-sm tabular-nums text-center">{tricks}</div>
        <div className="text-sm text-right">
          {played ? (
            <CardGlyph suit={played.suit} rank={played.rank} size="sm" />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </div>
    );
  })}
</div>;
```

If reveal is active (`selectSpReveal(state)`), optionally style the winner’s row with a subtle ring or accent.

### 4) Hand Dock (fixed)

Render the human’s hand as a compact, single‑row grid of buttons above the actions bar, matching the prototype’s look and interactions:

- Cards grouped/sorted using `selectSpHandBySuit(state, human)` and a fixed suit order `[spades, hearts, diamonds, clubs]`.
- Each button toggles a local `selectedCard` state on click (or Space/Enter for keyboard).
- Double‑click (or double‑tap) plays the card immediately if legal and it’s the human’s turn.

Reuse the legality checks already present in the current page (they account for follow‑suit and unbroken trump). Example play call:

```tsx
void append(events.spTrickPlayed({ playerId: human, card: { suit: c.suit, rank: c.rank } }));
```

Styling tips (Tailwind):

- Container: `fixed left-0 right-0 bottom-[calc(var(--safe-area-inset-bottom,0px)+52px)] border-t bg-background shadow`
- Grid: `grid grid-cols-10 gap-1 p-1` (tweak per viewport width)
- Card: `h-14 rounded border flex items-center justify-center font-bold` with suit colorization; add `ring` when selected.

### 5) Actions Bar (Details + Finalize)

Implement the sticky actions bar per the prototype:

- Left: plain button “Details” that opens the bottom sheet to Full height.
- Right: primary button “Finalize”.

Finalize behavior:

- Show a small confirm modal summarizing tricks won, trump broken, and estimated score delta.
- On confirm:
  - If you’re using the reveal‑gated flow (recommended and already implemented in `use-engine`), the engine finalizes after the last trick automatically; closing the modal is sufficient.
  - If you need an explicit finalize call (e.g., the round is in `complete` and all `made` values are set), dispatch `events.roundFinalize({ round: spRoundNo })`.

Disable the button while a batch is pending (`isBatchPending`) or if the round cannot be finalized yet.

### 6) Bottom Sheet (peek/mid/full)

The prototype includes drag to snap; you can start with a simple toggle among three states on tap of the handle. Model the same states:

- `peek`: translateY(100%)
- `mid`: translateY(40dvh)
- `full`: translateY(6dvh)

In React, hold a local `sheetState` and set classes accordingly. Content:

- Score row (human total)
- This round delta
- Bids (list each player with bold bid)
- Trick Log (optional; minimal placeholder is acceptable initially)
- Buttons: “Edit Score” (optional) and “Mark Trump Broken” (wired to `events.spTrumpBrokenSet`)

Use Tailwind utilities for padding, border, and backdrop; respect `env(safe-area-inset-bottom)` for bottom padding.

### 7) Toast and Modal

A minimal toast can be a fixed, centered chip above the actions bar that fades in/out with a timeout.
A basic modal can be a fixed overlay with centered dialog (use `backdrop-blur` + semi‑transparent background). Wire accessibility attributes as in the prototype (`aria-hidden`, `role="dialog"`, `aria-modal`, `aria-labelledby`).

## Accessibility

- All interactive chips/buttons must have `aria-label` and 44–48dp targets.
- The table uses readable text sizes and proper roles are not strictly required, but keep labels clear.
- Announce status changes (e.g., toast) via `aria-live="polite"`.
- The modal is focus‑trapped and closable via Esc; the sheet handle is keyboard‑operable.

## Differences From Prototype (Intentional)

- Trump suit is not user‑selectable (comes from deal). Keep the chip read‑only.
- Score editing and full trick log can be deferred; wire placeholders in the sheet.
- Drag gesture for sheet can be deferred; implement tap‑to‑cycle first.

## Guardrails and Integration Notes

- Do not duplicate single‑player runtime in local component state. Only keep UI‑transient state (selection, sheet open, modal open, toast text).
- Always use `append`/`appendMany` with `events.sp*` for runtime changes (plays, reveal clear, trump broken).
- Use `selectSpLiveOverlay(state)` for current plays plus counts; it already stays consistent with reveal gating.
- Keep the existing legality checks untouched when wiring play actions from the hand dock.

## Testing Checklist

- Header shows correct Round/Hand (hand increments while a trick is in progress) and updates Tricks won live.
- Trump Broken toggles via chip and is reflected in legality checks on lead.
- Compact table rows show name/bid/tricks/played; winner highlight appears during reveal.
- Hand dock renders all cards; selection toggles and double‑tap plays on your turn; cards disable when illegal.
- Details opens the sheet; Finalize opens confirm; confirm respects pending batches and round state.
- Layout remains usable on 320–360px widths and in landscape.

## References

- Prototype: `experiments/mobile-single-player-prototype/index.html` (+ `styles.css`, `script.js`)
- Existing SP page (logic and helpers): `app/single-player/page.tsx`
- Selectors and events: `lib/state/*`, `lib/state/selectors-sp.ts`, `lib/state/events.ts`
- Mobile design rationale: `SINGLE_PLAYER_UI_MOBILE.md`

---

This plan balances fidelity with the prototype and reuse of the app’s state/engine so you can land the new UI without risky refactors. Implement step‑by‑step and verify each section with the checklist above.
