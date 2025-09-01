Summary
- Set `/` to render `RoundsView` and removed the `/rounds` route.
- Added a `ready` flag to state and skeleton placeholders to avoid layout shift:
  - Rounds: 4 placeholder columns pre-hydration, then dynamic columns after hydration.
  - Scoreboard: 4 placeholder rows pre-hydration; empty-state only after ready.
- Updated docs and header active logic.

Changes
- `components/state-provider.tsx`: add `ready` flag and set after state instance creation.
- `components/views/RoundsView.tsx`: default 4 columns pre-hydration; switch to dynamic columns post-hydration using `gridTemplateColumns`; placeholder headers/cells.
- `components/views/ScoreboardView.tsx`: skeleton 4 rows before ready; show empty-state only when `ready && players.length === 0`.
- `app/page.tsx`: simplified to render `RoundsView`.
- Removed `app/rounds/page.tsx`. Updated `components/header.tsx` active logic.
- Docs: updated `README.md` and `STATE_INTEGRATION.MD` to remove `/rounds` references.

Rationale
- Eliminates initial relayout while state hydrates; provides a stable skeleton layout from first paint.
- Avoids duplicate routes and makes `/` the canonical rounds view.

Testing
- Fresh load: `/` shows placeholder columns/rows, then swaps to state on ready.
- Add/rename players; verify rounds interactions (bidding, complete, scored) remain correct.
- Scoreboard shows placeholders pre-ready; then entries or empty-state after ready.
- `/rounds` no longer exists; header highlights Rounds only on `/`.

Checklist
- [x] No layout shift at first paint on `/`.
- [x] Skeletons appear only pre-hydration.
- [x] `/rounds` removed; header logic updated.
- [x] Docs updated to reflect route changes.
