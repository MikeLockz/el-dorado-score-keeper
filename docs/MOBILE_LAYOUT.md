**Mobile Layout: Scale-To-Fit for >4 Players**

- **Goal:** Show up to 10 player columns in portrait without horizontal scrolling, while preserving proportions (text size, row height, paddings) so the scorecard remains readable and consistent.
- **Approach:** When the player count exceeds 4, render the score grid at its natural, fixed-column width and uniformly scale it down to fit the available viewport width. The scale is computed dynamically using a `ResizeObserver`, ensuring that the entire table shrinks proportionally. When ≤4 players (or in wider viewports), the grid remains unscaled and uses fluid columns.

**Key Details**

- **Uniform scaling:** A wrapper computes `scale = min(1, containerWidth / naturalGridWidth)`. The grid content is rendered using fixed `rem` columns to produce a stable "natural" width; the wrapper then applies `transform: scale(scale)` with `transform-origin: top left`.
- **Height management:** The outer container's height is set to `grid.scrollHeight * scale` so the scaled content is fully visible and there is no overlap/clipping.
- **Cutover threshold:** Scaling only activates when `players.length > 4`. For ≤4, layout remains as before (responsive `1fr` columns, no transform) so larger screens still benefit from the original sizing.
- **No horizontal scroll:** By design, scaling guarantees all columns are visible in portrait, eliminating the need for sideways scrolling even with 10 players.
- **Accessibility:** The DOM structure and ARIA roles are unchanged; the transform is purely visual, so semantics, keyboard navigation, and screen reader behavior remain intact.

**Why transform vs. per-breakpoint font tuning**

- The scorecard contains multiple nested font sizes, paddings, and elements whose relative sizes must stay aligned (e.g., bid, totals, state badge). Uniform scaling avoids complex conditional CSS and prevents proportional drift that would occur if we tuned each size independently.

**Implementation Notes**

- A small wrapper with `ResizeObserver` measures container width and content width and sets the scale reactively on resize/orientation and when player count changes.
- The grid uses fixed `rem` columns (row header: 3rem, each player column: 4.75rem) only in compact mode (>4 players) to create an intrinsic width that scales smoothly. In normal mode, it keeps the existing `1fr`-based fluid columns.
- The effect cleans up observers and recomputes on orientation change to keep sizing correct when rotating the phone.

**Edge Cases**

- If the available width is extremely narrow, the scale bottoms out so content remains fully visible (albeit small). Interaction targets remain usable because they scale together (hit areas remain consistent relative to text).
- Landscape or tablets naturally produce `scale = 1` unless players > 4 and the container is very constrained; in practice, landscape typically uses the unscaled (normal) layout.

**Follow-ups (optional)**

- Add a user setting to opt out of compact scaling for accessibility.
- Add a minimum scale clamp and switch to abbreviated headers/details when below a threshold to improve legibility on very small devices.
