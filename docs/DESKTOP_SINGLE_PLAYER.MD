# Desktop Single Player Layout

## Objectives

- Deliver a desktop-first layout that keeps the single-player orchestration intact while exposing core round context without modal or sheet interactions.
- Preserve visual language by leaning on the existing Tailwind tokens (`bg-card`, `bg-background`, `border`, `text-muted-foreground`, etc.) and card glyph components.
- Ensure the experience is fully operable with keyboard input and communicates key status updates to assistive tech.

## Layout Structure

- **Global header**: new top bar surfaces round number, hand progress, trump card (with glyph), and dealer info; replaces the mobile sticky header whose density felt cramped on larger screens.
- **Two-column main grid**: left column (`minmax(260px, 320px)`) hosts persistent round metadata; right column houses the interactive play surface.
- **Round overview card**: details bids, per-round scores, total tricks won, active phase, and the upcoming dealer. This consolidates the mobile sheet content into an always-visible panel.
- **Current trick card**: reuses `SpTrickTable`, wrapped to remove the mobile-only padding and constrain height to half the viewport for comfortable scanning.
- **Play controls card**: keeps bidding controls, hand dock, and primary CTA together; contextual helper text describes the next required action.
- **Last trick banner**: inline status block appears beneath the grid when applicable (mirrors the floating mobile toast but anchored for desktop).

## Additional Data & Enhancements

- Player labels now append “(you)” for the human participant to reduce ambiguity in multi-bot rounds.
- The overview card surfaces total tricks won and the upcoming dealer, which were previously hidden behind the mobile sheet.
- Primary CTA messaging adjusts between hand/round/game states to clarify intent before advancing.

## Accessibility Notes

- All critical sections include `aria-label`/`role="status"` where appropriate (e.g., the hand winner announcement is live-region enabled).
- Interactive controls now share a focus-visible outline aligned with the design tokens for consistent keyboard affordances.
- The action summary text in the play controls card communicates state transitions for screen readers.

## Deviations & Rationale

- Opted for a bespoke desktop header instead of reusing `SpHeaderBar` because the mobile sticky styling (dense text, minimal padding) did not scale gracefully on wide screens.
- Persisted mobile subcomponents (`SpTrickTable`, `SpHandDock`, summaries) to avoid duplicating logic; minor wrapper utilities normalize spacing without altering internals.
- “Mark/Unmark Trump Broken” moved from the mobile sheet into the overview panel so it remains visible without extra interaction.

## Open Questions / Follow-Ups

1. **Complete** – `app/single-player/page.tsx` now hydrates into `SinglePlayerDesktop` when `(min-width: 1024px)` matches via `matchMedia`, defaulting to mobile during SSR/first paint.
2. **Complete** – `useSinglePlayerViewModel` consolidates orchestration shared by mobile/desktop, exposing consistent props and actions.
3. **Open** – Validate the half-viewport height constraint for the trick table against real card counts; adjust if it needs to grow on very large monitors.
