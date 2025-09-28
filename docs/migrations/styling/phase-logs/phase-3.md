# Phase 3 Log – 2025-09-26

## Summary

- Kicked off component migrations by moving the shared ui primitives (Button, Input, Label, Card, Skeleton) to colocated Sass modules.
- Removed Tailwind dependencies (`cva`, `cn`) from these primitives and aligned styles with the token-driven mixins introduced in Phase 2.
- Established the living migration checklist to track future batches and QA sign-off requirements.

## Risks / Follow-ups

- Validate the new `color-mix` hover states in Safari/Firefox; add fallbacks if QA flags differences from the Tailwind blend behaviour.
- Card header/footer spacing now comes from Sass modules—confirm with design that padding aligns with the existing mocks before migrating downstream feature cards.
- Input background uses token-driven mixes; verify file input affordances in dark mode once smoke tests can be rerun.

## QA Status

- Awaiting an updated Playwright smoke pass; current CLI environment still has the pre-existing single-player harness failure (`tests/ui/single-player-harness.test.ts`).
- Manual checks (light/dark, responsive, keyboard focus) scheduled post-component adoption across the first feature surface.

---

# Phase 3 Log – 2025-09-27

## Summary

- Migrated `CardGlyph` and `SuitGlyph` primitives to Sass modules, replacing Tailwind utility strings with token-driven data attributes.
- Updated the migration checklist to reflect coverage of the remaining shared card glyph surface.
- Ported the Radix `Dialog` wrapper to Sass modules, re-creating overlay/content transitions without Tailwind.

## Risks / Follow-ups

- Validate the `calc(var(--space-1) / 2)` padding works as expected once tokens sync introduces rem changes.
- Confirm destructive suit contrast meets accessibility targets in dark mode screenshots.
- Verify dialog enter/exit animations on lower-powered devices; adjust easing if QA encounters frame drops.

## QA Status

- Awaiting a Playwright smoke capture that exercises scorecard surfaces using `CardGlyph` in all suits.
- Manual audit of warm vs. cool suit contrast scheduled alongside the Button/Input verification.
- Need responsive/light-dark QA pass on the updated dialog overlay and close button states.

---

# Phase 3 Log – 2025-09-27 (Evening)

## Summary

- Migrated the toast system, global header, and landing hero components (`HeroCtas`, `ModeCard`, `QuickLinks`) to Sass modules with token-driven spacing and state mixins.
- Removed remaining Tailwind utility strings from those surfaces and updated the migration checklist with QA follow-ups.

## Risks / Follow-ups

- Header dropdown + mobile menu need focused accessibility passes (keyboard trap, focus return) post-refactor.
- QuickLinks resume tiles rely on new color-mix tokens—confirm contrast against both light/dark backgrounds.
- Toast animation timing needs verification to ensure no regressions in motion preferences.

## QA Status

- Playwright smoke run still pending to capture updated landing hero and toast surfaces.
- Manual responsive sweeps scheduled for header + hero CTAs before expanding migration to feature flows.

---

# Phase 3 Log – 2025-09-27 (Night)

## Summary

- Converted landing/supporting pages (`app/landing`, redirect shells, scorecard wrapper) and the root layout to Sass modules, eliminating the remaining Tailwind utilities on those surfaces.
- Migrated `SpGameSummary` to a scoped module, wiring panel/full variants through shared mixins and reusing the new details controls styling.
- Updated the migration checklist with the new coverage and ran the focused landing/summary UI tests.

## Risks / Follow-ups

- Landing hero/title typography now relies on custom Sass mixins—coordinate with design for a quick typography spot check.
- Root skip-link styling changed; confirm behaviour across Safari/Firefox.
- `SpGameSummary` bottom nav still needs mobile visual QA before removing Tailwind from other SP views.

## QA Status

- `pnpm lint` ✅
- `pnpm vitest run tests/ui/landing-ui.test.tsx tests/ui/landing-snapshots.test.ts tests/ui/skip-link.test.tsx` ✅
- Full suite still red on known pre-existing failures (`tests/unit/game-flow/useNewGameRequest.test.tsx`, `tests/ui/sp-desktop-ui.test.tsx`).
- Playwright smoke + manual summary view audit remain on the backlog.

---

# Phase 3 Log – 2025-09-28 (Morning)

## Summary

- Migrated the confirmation dialog providers (`ConfirmDialog`, `PromptDialog`, `NewGameConfirm`) off Tailwind; introduced dedicated Sass modules for width, description alignment, and pending states.
- Ported the shared `Leaderboard` card and settings/players page shells to Sass modules, eliminating the remaining Tailwind wrappers around those surfaces.
- Updated the migration checklist to reflect new coverage and documented outstanding QA for dialog flows and leaderboard spacing.

## Risks / Follow-ups

- Dialog sr-only fallbacks now rely on custom Sass helpers; confirm screen reader output remains unchanged in VoiceOver/NVDA.
- Leaderboard truncation uses CSS overflow ellipsis—capture responsive screenshots to ensure names do not clip at smaller widths.
- Settings theme buttons reuse shared `Button` variants; verify no regressions when toggling between light/dark/system in browsers that cache themes.

## QA Status

- Manual dialog confirmation flows pending (light/dark themes, keyboard focus).
- Need targeted screenshot updates for leaderboard and settings surfaces once broader migration lands.
- `pnpm lint` / `pnpm vitest` to be rerun after today's batch; expect existing known failures to persist until addressed separately.

---

# Phase 3 Log – 2025-09-28 (Afternoon)

## Summary

- Finished the players management batch: `CreatePlayer`, `PlayerList`, `PlayerManagement`, and `SpRosterManagement` now consume scoped Sass modules for layout, drag states, and helper messaging.
- Rebuilt empty states, action bars, and roster grids to use token-driven spacing/typography, eliminating the last Tailwind utilities in the players workflow.
- Updated migration tracker with QA follow-ups for drag/drop behaviour, roster flows, and single-player cloning.

## Risks / Follow-ups

- Player drag handles rely on custom cursor + opacity styles—verify accessibility with keyboard-only interactions and screen readers.
- Roster loading buttons now share module spacing; ensure compact viewports still accommodate the button cluster without wrapping issues.
- Need to confirm spinner animations render smoothly in low-motion environments; provide prefers-reduced-motion fallback if needed.

## QA Status

- Manual end-to-end QA pending for player add/rename/remove flows and roster cloning/reset across light/dark themes.
- Drag-and-drop smoke coverage to be extended to the updated modules (follow-up test task).
- `pnpm lint` ✅, `pnpm vitest` ⚠️ (fails on pre-existing `tests/unit/game-flow/useNewGameRequest.test.tsx` assertions unrelated to styling changes).

---

# Phase 3 Log – 2025-09-28 (Evening)

## Summary

- Migrated the archived games list (`app/games/page`) to a Sass module, rebuilding the table, menu popover, and status messaging without Tailwind utilities.
- Ported the game detail view (`app/games/view/page`) to token-driven Sass grids and restyled round status badges via CSS modules.
- Converted the rules page prose and the single-player setup/loading screens to scoped Sass modules, replacing remaining Tailwind typography and layout helpers.

## Risks / Follow-ups

- Need responsive + theme QA for the games archive table (row hover, dialog transitions, mobile action menu).
- Capture updated screenshots for the game detail stats grid and validate badge contrast in light/dark themes.
- Single-player setup buttons require manual keyboard/focus verification on desktop and mobile breakpoints.

## QA Status

- `pnpm lint` ✅
- `pnpm format` ⚠️ (fails on long-standing Prettier diffs across legacy files; skipped `--write` to avoid unrelated churn).
- `pnpm test` ✅
- Manual QA pending per checklist items above.

---

# Phase 3 Log – 2025-09-29

## Summary

- Removed the legacy Tailwind helpers from `app/single-player/page.tsx`, eliminating the last `text-*` utility strings from the runtime surface.
- Deleted the `cn` shim in `lib/utils.ts`, so no components rely on `tailwind-merge`; all JSX now assembles CSS module classes directly.
- Replaced the remaining `sr-only` span in `components/ui/dialog.tsx` with a module-scoped visually hidden helper so the dialog stack is fully Sass-backed.
- Attempted to run the Playwright smoke suite for migration QA; documented the port-binding failure so we can coordinate on an alternate test strategy.

## Risks / Follow-ups

- Playwright cannot bind to `0.0.0.0:3100` inside the current sandbox. Need an alternate configuration (random port or forwarded dev server) before we can ship the required smoke evidence.
- `tailwind-merge` remains in `package.json`; remove the dependency and lockfile entry once CI confirms no lingering imports.
- Manual QA sweeps for the migrated components remain outstanding; schedule with Design/QA once automated smoke coverage is unblocked.

## QA Status

- `pnpm lint` ✅
- `pnpm test` not rerun; waiting until Playwright harness issue is resolved.
- `pnpm test:playwright` ❌ (fails to start local server: `listen EPERM 0.0.0.0:3100` inside sandbox).
