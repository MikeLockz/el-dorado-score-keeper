# Single Player Mobile UI — Focused Round/Hand Experience

## Goals

- **Mobile-first:** Optimized for one-handed use and small screens.
- **Round/hand focus:** Highlight what matters now; defer everything else.
- **Fast actions:** Prioritize reveal hand, clear hand, finalize round.
- **Clear state:** Show tricks won, score, trump broken, and whose turn.
- **Progressive disclosure:** Collapse secondary info; summon details on demand.

## Design Principles

- **Primary-first:** One clear primary action per screen state.
- **Information hierarchy:** Current hand > current round > meta/game history.
- **Space economy:** Use collapsible sections, chips, and bottom sheets.
- **Legibility:** Large cards, high contrast, ample hit targets (48dp min).
- **Thumb reach:** Critical controls at bottom; status at top.
- **Stateful feedback:** Inline changes, subtle motion, persistent chips for flags.

## Layout Overview (Portrait)

- **Top bar:** Round/Hand, current trump, status chips (trump broken), menu.
- **Content:** Card area with large tappable cards; optional fan or grid.
- **Sticky action bar:** Primary and secondary actions; context-aware.
- **Collapsible detail panel:** Score, bids, trick log in a bottom sheet/drawer.

## Information Architecture

- **Always visible:** Round X · Hand Y, your cards, tricks won (this round), trump chip, primary actions.
- **Condensed chips:** Score total, per-round delta, “Trump Broken” state.
- **On demand:** Bids, trick history, opponents’ tricks, full scoreboard, settings.

## Key Elements

- **Round/Hand header:** "Round 5 · Hand 3 of 10" with progress dot bar.
- **Status chips:** "Trump: Hearts", "Trump Broken", "Your Turn".
- **Tricks counter:** Compact pill near header: "Tricks: 2".
- **Card surface:** Edge-to-edge safe-area layout; cards scale to width.
- **Sticky action bar:** Primary CTA left-centered; secondary CTAs to right.
- **Bottom sheet:** Collapsible; snaps to 24%, 60%, and full screen.

## Primary Actions

- **Reveal Hand:** Shows all card faces; toggles to Hide Hand after reveal.
- **Clear Hand:** Clears selected/played cards for current hand (with undo).
- **Finalize Round:** Advances round; shows confirmation dialog when needed.

## Secondary Actions

- **Undo/Redo:** Last operation on the current hand.
- **Mark Trump Broken:** Toggle when rule requires explicit state.
- **Edit Score:** Opens score correction in sheet with keypad.

## States & Feedback

- **Selection:** Card gains elevation, glow, and selection count chip.
- **Reveal:** Cards flip with short stagger; action toggles to “Hide Hand”.
- **Clear:** Cards slide down and minimize; show snackbar with Undo.
- **Finalize:** Validate prerequisites; show blocking confirm if unmet.
- **Trump broken:** Persistent chip turns accent color; brief toast on change.
- **Score change:** Delta badge +x/−y animates near Score chip.

## Collapsible Details (Bottom Sheet)

- **Peek (24%):** Score summary, per-player tricks, expand handle.
- **Mid (60%):** Bids, trick history list, round recap.
- **Full (100%):** Full scoreboard, rules/help, settings.

## Accessibility

- **Touch targets:** 48×48dp min; 8dp spacing.
- **Contrast:** WCAG AA minimum for text and chips.
- **Labels:** Full text labels on CTAs; aria-live for status changes.
- **Gestures:** All gestures have visible control alternatives.
- **Haptics:** Light tap for selection; success haptic on finalize.

## Wireframes (ASCII)

### 1) Default — Focus on Current Hand

```
┌─────────────────────────────────────────────────────────┐
│  Round 5 · Hand 3/10                     ⋮ Menu         │
│  [Trump: ♥ Hearts]  [Tricks: 2]  [Score: 38]           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ╭───╮  ╭───╮  ╭───╮  ╭───╮  ╭───╮                     │
│   │ A │  │10 │  │ 9 │  │ 7 │  │ 5 │   Your cards        │
│   │♥  │  │♣  │  │♠  │  │♦  │  │♥  │   Large, readable   │
│   ╰───╯  ╰───╯  ╰───╯  ╰───╯  ╰───╯                     │
│                                                         │
│   [ + Add/Play ]  (optional if gameplay requires)       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  ⓘ  Peek: Score • Bids • Trick Log   ▔▔▔▔▔▔             │
└─────────────────────────────────────────────────────────┘
┌──────────────── Sticky Action Bar ──────────────────────┐
│  [ Finalize Round ]   [ Reveal Hand ]   [ Clear Hand ]  │
└─────────────────────────────────────────────────────────┘
```

### 2) After Reveal — Emphasis on Visibility

```
┌─────────────────────────────────────────────────────────┐
│  Round 5 · Hand 3/10                     ⋮              │
│  [Trump: ♥ Hearts]  [Trump Broken]  [Tricks: 2]         │
├─────────────────────────────────────────────────────────┤
│   Cards flip face-up with subtle stagger; selection on  │
│   tap shows count [2 selected].                         │
│                                                         │
│   ╭───╮  ╭───╮  ╭───╮  ╭───╮  ╭───╮                     │
│   │ A │  │10 │  │ 9 │  │ 7 │  │ 5 │                    │
│   │♥  │  │♣  │  │♠  │  │♦  │  │♥  │                    │
│   ╰───╯  ╰───╯  ╰───╯  ╰───╯  ╰───╯                     │
├─────────────────────────────────────────────────────────┤
│  ⓘ  Peek: Score +2 this hand • Opponent tricks: 1       │
└─────────────────────────────────────────────────────────┘
┌──────────────── Sticky Action Bar ──────────────────────┐
│  [ Finalize Round ]   [ Hide Hand ]   [ Clear Hand ]    │
└─────────────────────────────────────────────────────────┘
```

### 3) Bottom Sheet — Mid Expansion (Details On Demand)

```
┌─────────────────────────────────────────────────────────┐
│  … main content dimmed                                   │
├─────────────────────────────────────────────────────────┤
│  ▄▄▄▄▄▄▄▄▄▄▄▄▄  Drag handle                              │
│  Score                                               38  │
│  This round                                         +6   │
│  ─────────────────────────────────────────────────────   │
│  Bids                                                 │  │
│   • You: 2   • Opp A: 1   • Opp B: 0                    │
│  Trick Log                                             │
│   • Trick 1: You (♥A)                                   │
│   • Trick 2: Opp A (♣K)                                 │
│  [ Edit Score ]  [ Mark Trump Broken ]                  │
└─────────────────────────────────────────────────────────┘
```

### 4) Finalize Round — Confirmation

```
┌──────────────── Confirm Finalize Round ─────────────────┐
│ You won 2 tricks. Trump broken: Yes.                    │
│ Score change: +6 (Total 38 → 44). Proceed?              │
│                                                        │
│  [ Cancel ]                          [ Finalize ]       │
└─────────────────────────────────────────────────────────┘
```

### 5) Landscape (Compact Controls, Same Priorities)

```
┌───────────────┬─────────────────────────────────────────┐
│ Round 5 · 3/10│  Cards wide; actions as right rail      │
│ [♥ Trump] [T] │  [Finalize] [Reveal/Hide] [Clear]       │
│ Tricks: 2     │  Bottom sheet becomes right drawer      │
└───────────────┴─────────────────────────────────────────┘
```

## Component Behaviors

- **Sticky action bar:** Hidden on scroll down, returns on up-scroll or when a selection exists.
- **Bottom sheet:** Remembers last height per session; shows score delta highlights.
- **Status chips:** Tappable; open contextual mini-sheets (e.g., change trump, toggle broken).
- **Cards:** Support single tap select, long-press multi-select mode, and drag to play (optional).

## Empty/Edge States

- **No cards:** Show illustration and primary CTA “Add Cards” (if applicable).
- **Invalid finalize:** Disable button with reason; or show inline checklist of missing steps.
- **Trump unknown/unset:** Chip reads “Trump: —”; tapping opens selector sheet.

## Motion & Feedback

- **Card flip:** 150–200ms with 20ms stagger on reveal/hide.
- **Chip pulse:** 200ms pulse when trump broken toggles on.
- **Score delta:** Count-up animation for +/− values near Score chip.
- **Sheet transitions:** Ease-out expand; ease-in collapse.

## Visual Style (Guidance)

- **Typography:** Large title for Round/Hand; medium labels on chips; 16–18pt card indices.
- **Color:** Neutral background; trump color accents (e.g., hearts/diamonds red, clubs/spades dark).
- **Elevation:** Cards 2dp base; selected 6dp; bottom sheet 8dp; sticky bar 4dp.
- **Chips:** Filled for active flags (e.g., “Trump Broken”); outlined for passive state.

## Implementation Notes

- **Layout:** Safe-area insets; flex column with sticky footer across iOS/Android PWAs.
- **Hit areas:** Padding added to card bounds; invisible gutters between cards for scroll safety.
- **Persistence:** Store UI state (sheet height, reveal toggle) in local storage per game id.
- **Theming:** Provide high-contrast theme toggle; respect prefers-reduced-motion.

## Telemetry (Optional)

- **Action usage:** Reveal, Clear, Finalize frequency and undo usage.
- **Error rate:** Failed finalize attempts and reasons.
- **Discoverability:** Bottom sheet expansion events to confirm progressive disclosure works.

## Checklist For Build

- **Header:** Round/Hand text + trump + tricks + score chips.
- **Card grid/fan:** Responsive sizing; 2–3 rows on small screens if needed.
- **Sticky action bar:** Primary and secondary CTAs with clear labels.
- **Bottom sheet:** Score summary, bids, trick log; snap points and drag handle.
- **State indicators:** Trump broken, turn state, score delta; accessible live regions.
- **Dialogs/snackbars:** Confirm finalize, undo clear, validation errors.

---

This document proposes a mobile-first layout that keeps the player’s attention on the current hand and round, with secondary information accessible via collapsible patterns to maintain clarity and speed.
