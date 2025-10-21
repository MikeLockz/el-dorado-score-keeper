# IMPLEMENTATION PLAN — Game Landing Page

A guide for the simplified landing page implementation that introduces the El Dorado card game and provides access to recent games and learning resources.

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

- Landing page implemented at `app/landing/page.tsx`
- Primary CTA routes to `/single-player` (existing single player game)
- Quick Links connect to existing routes:
  - Recent games → their respective resume URLs
  - How to Play → `/rules`

—

## Current Implementation Status

The landing page has been implemented with the following components:

### Core Structure
- `app/landing/page.tsx` - Main landing page component
- `components/landing/HeroCtas.tsx` - Hero section with primary CTA
- `components/landing/QuickLinks.tsx` - Recent games and resource links

### Features
- Hero section introducing "Set Out for El Dorado" with game description
- Primary "Start Single Player" call-to-action button
- Quick Links section displaying recent games with resume functionality
- "How to Play" link for new players
- Responsive design for mobile, tablet, and desktop
- Accessibility features with proper ARIA labels

### Removed Components
The following components were removed during simplification:
- `components/landing/ModeCard.tsx` - Previously displayed three game mode cards
- Modes Grid section that contained Single Player, Multiplayer, and Score Card options
- Associated tests and styling for the removed components

---

## Implementation Notes

### Hero Section
- Contains the game title "Set Out for El Dorado"
- Subtitle: "A card game from south western Michigan"
- Primary CTA button linking to `/single-player`

### Quick Links Section
- Displays recent games from IndexedDB storage
- Shows game mode, player count, and current progress
- Provides resume buttons for active/in-progress games
- Shows "How to Play" link for learning resources
- Displays empty state when no recent games exist

### Styling
- Uses SCSS modules for component styling
- Responsive design with breakpoints for mobile/tablet/desktop
- Consistent with existing application design patterns
- Proper spacing and visual hierarchy

### Analytics
- Tracks hero CTA clicks: `hero_start_single_clicked`
- Monitors recent game resume actions
- Follows existing analytics patterns in the application

Run & Commit

- `pnpm lint && pnpm test && pnpm typecheck`
- Commit: "feat(landing): simplified page implementation complete"

---

## Current File Structure

- `app/landing/page.tsx` — Main landing page composition
- `components/landing/HeroCtas.tsx` — Hero section with primary CTA
- `components/landing/QuickLinks.tsx` — Recent games and resource links
- `app/landing/page.module.scss` — Landing page styles

---

## Commands Reference

- Lint: `pnpm lint` (or `npm run lint`)
- Tests: `pnpm test` (or `npm test`), watch: `pnpm test:watch`
- Typecheck: `pnpm typecheck`
- Format check: `pnpm format` (write: `pnpm format:write`)

---

## Current Status

✅ **IMPLEMENTATION COMPLETE**

- Landing page is live at `/landing` with accessible, responsive UI
- Primary CTA functions with analytics tracking
- Quick Links section displays recent games and learning resources
- All lints/tests/typechecks pass
- Documentation updated to reflect current implementation
