# IMPLEMENTATION PLAN — Game Landing Page

A phased plan to implement the new, mode‑driven landing hub described in GAME_LANDING_PAGE.md. Phases minimize risk by shipping a self‑contained page first, then swapping it in as the home route. Each phase finishes with: lint, tests, and a commit before moving on.

—

## Tech/Conventions To Follow

- Framework: Next.js App Router (TypeScript, React 19)
- UI: Tailwind CSS 4 + Radix primitives; reuse `components/ui/{button,card,card-glyph}`
- Icons: `lucide-react` (consistent with existing views)
- State: `components/state-provider` and `lib/state/*` (IndexedDB, cross‑tab sync)
- Tests: Vitest (`tests/**`) with jsdom for UI tests
- Lint/format: `pnpm lint`, `pnpm format`; typecheck: `pnpm typecheck`

—

## Routing Decisions

- Implement page at `app/landing/page.tsx` first to iterate safely.
- Map CTAs to existing routes:
  - Single Player → `/single-player`
  - Score Card → `/` (current score grid)
  - Multiplayer → placeholder routes for now; wire CTA to `/rules` or a stub until multiplayer lands.
- Add redirects later so suggested paths resolve:
  - `/single` → `/single-player`
  - `/scorecard` → `/`
  - `/how-to` → `/rules`

—

## Phase 1 — Scaffold Landing Page (non‑breaking)

Scope

- Create `app/landing/page.tsx` with shell sections: `Hero`, `ModesGrid`, `QuickLinks`.
- Create `components/landing/ModeCard.tsx` (icon, title, description, primary/secondary actions, accessible labels).
- Use existing `Header` and global layout. Keep styles consistent with `components/views/*` (Tailwind spacing, rounded md, subtle borders, AA contrast).

Acceptance

- Visiting `/landing` renders hero + three cards (buttons link to intended routes; secondary links stubbed or hidden as needed).
- Page is responsive (1 col on mobile, 3 cols desktop).

Tests

- Add `tests/ui/landing-ui.test.tsx` to assert:
  - Hero heading and three primary CTAs exist and point to correct hrefs.
  - Each card has an `aria-label` per spec and appropriate roles.

Run & Commit

- `pnpm lint && pnpm test && pnpm typecheck`
- Commit: "feat(landing): scaffold page, ModeCard, basic UI tests"

—

## Phase 2 — Quick Actions and Recents

Scope

- `QuickLinks` below the grid:
  - “Resume current game” → link to `/` when there is progress (detect via `useAppState()`; show when `ready` and `height > 0`).
  - “Recent Sessions” → use archived games from `lib/state/io.ts` → `listGames()` (most recent 3). Each item links to `/games/view?id=<id>`.
  - “How To Play” → `/rules`.
- Empty state: hide recents when none; show copy “Your games will appear here.”

Acceptance

- With archives present, three most recent appear; with none, the section shows the empty copy.
- “Resume current game” only shows when a current game exists.

Tests

- Extend `tests/ui/landing-ui.test.tsx`:
  - Mock `listGames()` to return N items; assert list rendering and hrefs.
  - Mock `useAppState()` with `height = 0` vs `>0` to toggle “Resume”.

Run & Commit

- `pnpm lint && pnpm test && pnpm typecheck`
- Commit: "feat(landing): quick actions and recents wired to state"

—

## Phase 3 — Accessibility & Motion Preferences

Scope

- Ensure AA contrast and focus rings (match existing patterns in `components/views/*`).
- Add `aria-label` to each `ModeCard` exactly as in GAME_LANDING_PAGE.md.
- Respect `prefers-reduced-motion` (no parallax/animated mounts; simple fades off by default).
- Add a visually hidden “Skip to content” link in `app/layout.tsx` just before `<Header />` (if not already present) that targets the landing main.

Acceptance

- Tabbing reveals visible focus outlines on interactive elements; skip link works.
- Axe (or manual checks) show basic a11y satisfied; motion reduced when preference set.

Tests

- Add light a11y/unit checks with jsdom:
  - Presence of `aria-label` attributes; tabIndex on cards only when necessary.
  - No runtime warnings from rendering.

Run & Commit

- `pnpm lint && pnpm test && pnpm typecheck`
- Commit: "chore(landing): accessibility polish and reduced-motion support"

—

## Phase 4 — Analytics Pings (lightweight)

Scope

- Fire basic client log events on primary CTA clicks using `fetch('/api/log', { method: 'POST', body })` (see `app/api/log/route.ts`).
- Event names per doc: `hero_start_single_clicked`, `mode_multiplayer_host_clicked`, `mode_scorecard_open_clicked`.
- Include `path` and timestamp; keep payloads minimal.

Acceptance

- Clicking CTAs POSTs to `/api/log` without blocking navigation.

Tests

- Mock `global.fetch` in the UI test to assert POSTs on click (no need to test server route again).

Run & Commit

- `pnpm lint && pnpm test && pnpm typecheck`
- Commit: "feat(landing): analytics events for primary CTAs"

—

## Phase 5 — Swap Home Route (controlled)

Scope

- Swap landing to `/` and move Current Game to `/scorecard` alias, or keep Current Game at `/` and add redirect from `/scorecard` → `/`.
- Safer rollout path:
  1. Add redirects in `next.config.mjs`:
     - `/single` → `/single-player`
     - `/scorecard` → `/`
     - `/how-to` → `/rules`
  2. Add a top‑level CTA to “Current Game” in the landing hero for continuity.
  3. Optionally rename menu item in `components/header.tsx` from “Current Game” to “Score Card” for clarity.
- If/when making landing the homepage:
  - Rename existing `app/page.tsx` to `app/scorecard/page.tsx`.
  - Move `app/landing/page.tsx` → `app/page.tsx`.

Acceptance

- Navigating to `/` shows new landing; `/scorecard` and menu still provide access to the score grid.
- Redirects work in dev and static export.

Tests

- UI test loads `/` and asserts landing elements are present.
- Minimal integration for redirects: import `next.config.mjs` and assert config exposes rewrites/redirects (if implemented as runtime redirects, rely on manual/CI verification).

Run & Commit

- `pnpm lint && pnpm test && pnpm typecheck`
- Commit: "feat(landing): promote to home, add redirects and header copy"

—

## Phase 6 — Polish: Copy, Icons, Visual Rhythm

Scope

- Finalize copy from GAME_LANDING_PAGE.md hero and cards.
- Icons: `Compass` (Single Player), `Users`/`Flame` (Multiplayer), `Calculator` (Score Card) from `lucide-react`.
- Spacing: use 8px scale; card padding 16–24px; hero vertical 64–96px on desktop; 12px gaps for CTA group.

Acceptance

- Desktop/tablet/mobile layouts match wireframes and feel cohesive with existing pages.

Tests

- Snapshot test for the three ModeCards (stable HTML structure only; avoid over‑brittle class snapshots).

Run & Commit

- `pnpm lint && pnpm test && pnpm typecheck && pnpm format`
- Commit: "style(landing): icon/copy polish and layout rhythm"

—

## Non‑Goals (for now)

- Implementing real multiplayer routes and backend; CTAs can point to `/rules` or a placeholder until scoped.
- New global theme toggle (the ThemeProvider already handles system/theme; reuse existing patterns).
- Adding new state persistence for "recents"; we reuse archived games via `listGames()` instead of a separate `localStorage` key.

—

## File/Module Map (proposed)

- `app/landing/page.tsx` — Composition of Hero, ModesGrid, QuickLinks
- `components/landing/ModeCard.tsx` — Reusable card component
- `components/landing/QuickLinks.tsx` — Resume + recents + how‑to links
- `tests/ui/landing-ui.test.tsx` — UI and behavior tests
- (Phase 5) `app/scorecard/page.tsx` — Former `app/page.tsx` if we make landing the home route

—

## Commands Reference

- Lint: `pnpm lint` (or `npm run lint`)
- Tests: `pnpm test` (or `npm test`), watch: `pnpm test:watch`
- Typecheck: `pnpm typecheck`
- Format check: `pnpm format` (write: `pnpm format:write`)

—

## Exit Criteria

- Landing page live at `/` or `/landing` with accessible, responsive UI.
- Primary CTAs and secondary links function; analytics pings fire on click.
- Recents list reflects archives and empty state.
- All lints/tests/typechecks pass; commits after each phase.
