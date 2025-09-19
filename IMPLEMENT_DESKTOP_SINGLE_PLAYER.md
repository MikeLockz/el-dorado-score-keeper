# IMPLEMENTATION PLAN — Desktop Single Player

A phased plan to deliver the desktop experience described in DESKTOP_SINGLE_PLAYER.MD. Each phase focuses on maintainable abstractions, parity with mobile, and accessible UI while keeping state orchestration consistent. After every phase: validate scope completion, run `pnpm format`, `pnpm lint`, `pnpm test`, and commit before moving forward.

—

## Tech/Conventions To Follow

- Framework: Next.js App Router (TypeScript, React 19)
- State: `components/state-provider`, selectors in `lib/state`, single-player engine utilities in `lib/single-player`
- Styling: Tailwind design tokens already configured (`bg-card`, `text-muted-foreground`, `min-h-dvh`, etc.)
- UI primitives: reuse `SpTrickTable`, `SpHandDock`, `SpRoundSummary`, `SpGameSummary`, and shared `CardGlyph`
- Tests: Vitest with jsdom (`tests/ui/**`), unit tests for selectors/helpers (`tests/unit/**`)
- Accessibility: prefer semantic landmarks, focus-visible states, live regions for announcements

—

## Phase 1 — Extract Shared Single-Player View Model

Scope

- Factor duplicated orchestration from `SinglePlayerMobile` into a shared hook or utility (e.g., `useSinglePlayerViewModel`) that encapsulates selectors, computed props, and actions (`onConfirmBid`, `playCard`, `userAdvanceBatch`).
- Ensure the abstraction is presentation-agnostic and memoizes expensive computations (trick counts, totals) to avoid extra renders.
- Update `SinglePlayerMobile` to consume the shared hook without altering current behavior.

Acceptance

- Mobile view compiles and behaves unchanged, confirmed via existing UI tests.
- Shared hook exposes only serializable data/functions needed by both views; no UI-specific side effects remain in the hook.

Tests

- Add unit coverage for the new hook if logic warrants (e.g., verifying computed `playerLabel`, `handNow` calculations).
- Extend existing mobile UI tests if necessary to reflect refactor (snapshot or interaction parity).

Validation & Commit

- `pnpm format && pnpm lint && pnpm test`
- Commit: `refactor(sp): share single-player view model`

—

## Phase 2 — Implement Desktop View Component

Scope

- Create `components/views/SinglePlayerDesktop.tsx` leveraging the shared view model.
- Build the desktop layout per design doc: header with round metadata, two-column grid (overview + play surface), inline last-trick banner.
- Ensure accessibility: expressive `aria-label`s, focus-visible rings on controls, `aria-live="polite"` on winner announcements.
- Keep styling consistent with tokens; avoid bespoke CSS.

Acceptance

- Rendering the desktop component with mocked state (story or test) shows expected sections: header, overview card, current trick card, controls card.
- Desktop component compiles without warnings and passes type checks.

Tests

- Add `tests/ui/sp-desktop-ui.test.tsx` covering:
  - Header text (round, hand, trump) renders from state.
  - Overview lists bids/scores and toggles trump broken button.
  - CTA label changes across phases (bidding vs. reveal).

Validation & Commit

- `pnpm format && pnpm lint && pnpm test`
- Commit: `feat(sp): add desktop single-player view`

—

## Phase 3 — Integrate Responsive View Selection

Scope

- Update `app/single-player/page.tsx` to choose mobile vs. desktop component based on viewport/device (e.g., `useMediaQuery('(min-width: 1024px)')`, or existing responsive utility).
- Provide SSR-safe fallback (render mobile by default, hydrate to desktop when conditions met) to avoid hydration mismatches.
- Ensure shared hook is used by both components without duplicating logic.

Acceptance

- Desktop widths render the new layout; mobile widths retain the current experience.
- No console hydration warnings when toggling breakpoints.

Tests

- Extend UI tests to mount page component with mocked matchMedia, asserting correct component selection.
- Add regression test ensuring hook returns stable references (important for memoized subcomponents).

Validation & Commit

- `pnpm format && pnpm lint && pnpm test`
- Commit: `feat(sp): switch single-player view by breakpoint`

—

## Phase 4 — Performance & Accessibility Polish

Scope

- Audit memos/effects to prevent redundant `computeAdvanceBatch` calls; ensure handlers are `useCallback` where needed to reduce downstream renders.
- Run Axe (or equivalent) locally; address any violations (landmarks, color contrast, focus traps).
- Confirm keyboard-only playthrough works (tab order, Enter/Space activation on buttons, arrow interactions if necessary).

Acceptance

- React Profiler shows no significant regression vs. mobile baseline.
- Manual a11y audit passes (focus outlines, live regions, aria attributes).

Tests

- Add focused unit test for any new helper (e.g., `getNextDealerLabel`).
- Augment desktop UI test to verify focus management (simulate keyboard events where possible).

Validation & Commit

- `pnpm format && pnpm lint && pnpm test`
- Commit: `chore(sp): desktop performance and accessibility polish`

—

## Phase 5 — Documentation & Release Readiness

Scope

- Update `README.md` or relevant docs to describe the new responsive behavior and how to choose components in future features.
- Document follow-up tasks (analytics, feature flags) in `UPDATED_PLAYER_ENHANCEMENTS.md` or similar roadmap files.
- Ensure CI pipelines (if any) are green with new tests.

Acceptance

- Repository docs reference desktop layout, and onboarding instructions remain accurate.
- All prior phases' changes are merged; no TODOs remain in code without tickets.

Tests

- No new code, but re-run full suite to confirm stability after doc edits.

Validation & Commit

- `pnpm format && pnpm lint && pnpm test`
- Commit: `docs(sp): finalize desktop single-player rollout`

—

## Ongoing Considerations

- Monitor bundle size; if desktop assets increase payload significantly, consider dynamic import of heavy sections.
- Evaluate analytics needs post-launch to understand desktop engagement.
- Revisit touch-gesture affordances for tablet breakpoints if those devices load the desktop view.
