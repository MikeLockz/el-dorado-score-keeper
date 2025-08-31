# El Dorado Score Keeper

Simple score keeper for The Quest for El Dorado. Built with Next.js App Router and Tailwind, with a small state layer and optional devtools in development.

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/budgetflowr-4480s-projects/v0-mobile-friendly-score-interface)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app/chat/projects/TyFuAeQ3Y59)

## Quickstart

Requirements:

- Node.js 18.18+ (Node 20+ recommended)
- A package manager: pnpm (recommended) or npm

Install dependencies:

```bash
# with pnpm
pnpm install

# or with npm
npm install
```

Start the dev server:

```bash
# with pnpm
pnpm dev

# or with npm
npm run dev
```

Open http://localhost:3000 in your browser.

Production build and run:

```bash
pnpm build && pnpm start
# or
npm run build && npm start
```

Notes:

- No environment variables are required for local development.
- Devtools render automatically when `NODE_ENV !== 'production'`.
- To change the port: `PORT=3001 pnpm dev` (or `PORT=3001 npm run dev`).

## Scripts

- `dev`: Start Next.js in development mode.
- `build`: Create a production build.
- `start`: Run the production server (after `build`).
- `lint`: Run Next.js lint.
- `test`: Run tests once with Vitest.
- `test:watch`: Watch mode for tests.
- `coverage`: Generate test coverage report.

## Tech Stack

- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Radix UI primitives + `lucide-react` icons
- Vitest for unit/integration tests

## Project Structure

- `app/`: App Router pages, layout, and styles.
- `components/`: UI components and state provider.
- `lib/`: State management, storage, and selectors.
- `public/`: Static assets and PWA icons/manifest.
- `styles/`: Global styles.
- `tests/`: Unit, integration, and property tests (Vitest).

## Routes

- `/`: Scoreboard — add players, adjust scores, and view the live leaderboard.
- `/rounds`: Rounds — manage per-round bidding and scoring. Cycles states (locked → bidding → complete → scored), set bids per player, mark made/missed, and finalize to apply points to totals.

### Scoreboard (`/`) details

- Add players: type a name and press Add; empty/whitespace is ignored.
- Adjust scores: per-player −1 and +1 buttons update totals immediately.
- Leaderboard: shows top players (up to 5), sorted by score then name.
- Empty state: friendly prompt when no players exist.
- Persistence: data saved locally (IndexedDB) and synced across tabs.
- Devtools (development only): floating panel for event height, time‑travel preview, and recent warnings.

### Rounds (`/rounds`) details

- Round grid: 10 rounds (tricks 10 → 1) across all players; header shows two‑letter initials.
- State machine: click round tile to cycle bidding → complete → scored → bidding. Locked rounds cannot be advanced directly.
- Bidding: per‑player bid with +/−; clamped to 0..tricks for that round.
- Completion: mark each player made/missed with Check/X.
- Finalize scoring: from complete, when all players are marked; applies ±(5 + bid) to totals and sets round to scored.
- Auto‑unlock: finalizing a round sets the next locked round to bidding.
- Scored view: shows made/missed, bid, point delta, and current total score.

## Deployment

Deployed on Vercel: https://vercel.com/budgetflowr-4480s-projects/v0-mobile-friendly-score-interface

You can also continue building from v0.app if you use it for deployments: https://v0.app/chat/projects/TyFuAeQ3Y59
