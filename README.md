# El Dorado Score Keeper

Simple score keeper for the card game El Dorado.

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

## Local Dev Commands

```bash
# Start the dev server
pnpm dev

# Run tests in watch mode
pnpm test:watch

# Lint the codebase
pnpm lint
```

Note: Storybook is not set up in this repo. If you add Storybook later, the standard command will be `pnpm storybook`.

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
- `tokens:sync`: Regenerate Sass and JSON design token artifacts from the canonical design token catalog.
- `tokens:watch`: Watch design token changes and regenerate artifacts on save.

## Tech Stack

- Next.js 15 (App Router)
- React 19
- TypeScript
- Sass modules with token-driven theming
- Radix UI primitives + `lucide-react` icons
- Vitest for unit/integration tests

## Project Structure

- `app/`: App Router pages, layout, and styles.
- `components/`: UI components and state provider.
- `lib/`: State management, storage, and selectors.
- `docs/ROSTERS.md`: Roster model (mode-scoped players), events, selectors, and migration notes.
- `public/`: Static assets and PWA icons/manifest.
- `styles/`: Global styles.
- `tests/`: Unit, integration, and property tests (Vitest).

## Routes

- `/`: Current Game — default view for per-round bidding and scoring.
- `/players`: Players — add, rename, and remove players; reset all players.
- `/games`: Games — archive the current game, and view/restore/delete archived games.
- `/rules`: Quick reference for scoring and phases.

### Players (`/players`) details

- Score Card players (legacy): add/rename/soft-drop and reset; persists scores/round data.
- Single Player roster: separate, mode-scoped roster with its own add/rename/reorder/remove/reset; can clone Score Card.
- Empty state: friendly prompt when no players exist.
- Persistence: data saved locally (IndexedDB) and synced across tabs.
- Devtools (development only): floating panel for event height, time‑travel preview, and recent warnings.

### Games (`/games`) details

- List: shows archived games with title, finished time, players count, and winner.
- New Game: archives the current game and starts a fresh one; navigates to `/`.
- Restore: replaces current progress with a selected archived game.
- Delete: permanently removes an archived game.

### Current Game (`/`) details

- Round grid: 10 rounds (tricks 10 → 1) across all players; header shows two‑letter initials.
- State machine: click round tile to cycle bidding → complete → scored → bidding. Locked rounds cannot be advanced directly.
- Bidding: per‑player bid with +/−; clamped to 0..tricks for that round.
- Completion: mark each player made/missed with Check/X.
- Finalize scoring: from complete, when all players are marked; applies ±(5 + bid) to totals and sets round to scored.
- Auto‑unlock: finalizing a round sets the next locked round to bidding.
- Scored view: shows made/missed, bid, point delta, and current total score.

### Rules (`/rules`) details

- Overview: 10 rounds; tricks decrease 10 → 1; bid, mark made/missed, then finalize to apply points.
- Round flow: Bidding → Complete → Finalize; next locked round auto‑unlocks to bidding.
- Scoring: Made = + (5 + bid); Missed = − (5 + bid).
- Notes: Round states cycle locked → bidding → complete → scored; locked rounds can’t advance; data persists locally and syncs across tabs.

## Deployment

Github Actions workflow deploys to GitHub Pages on push to `main`.

## Analytics Relay (Cloudflare Worker)

This repo includes a lightweight analytics relay that forwards pageview details to Slack securely. Client code posts to a Cloudflare Worker you control; the Worker adds IP and sends a concise emoji‑rich Slack message.

- Worker code: `cloudflare/analytics-worker/src/worker.ts`
- Config: `cloudflare/analytics-worker/wrangler.toml`
- CI deploy: `.github/workflows/deploy-cloudflare-worker.yml`

Setup (local quick test)

- Install Wrangler v4: `npm i -g wrangler@4`
- Login: `wrangler login`
- Set secrets (replace paths as needed):
  - `wrangler --config cloudflare/analytics-worker/wrangler.toml secret put SLACK_WEBHOOK_URL`
  - Optional: `wrangler ... secret put ANALYTICS_TOKEN`
  - Optional: `wrangler ... secret put ALLOWED_ORIGIN` (e.g., `https://yourdomain.com`)
- Deploy: `wrangler deploy --config cloudflare/analytics-worker/wrangler.toml`
- Note your URL: `https://analytics-relay.<account>.workers.dev`

GitHub Actions deploy

- Add repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SLACK_WEBHOOK_URL`, optional `ANALYTICS_TOKEN`, `ALLOWED_ORIGIN`.
- Push changes in `cloudflare/analytics-worker/**` (or run workflow manually) to deploy.

Client configuration example

```html
<script>
  window.analyticsConfig = {
    webhookUrl: 'https://analytics-relay.<account>.workers.dev',
    siteId: 'el-dorado-score-keeper',
    env: 'prod',
    includeIP: 'server',
    emoji: true,
    disabledInDev: true,
    authToken: '${ANALYTICS_TOKEN}', // if configured
  };
</script>
```

More details and the full tracking snippet live in `ANALYTICS.md`.

## IndexedDB Schema

- Version constants live in `lib/state/db.ts` (`SCHEMA_V1`, `SCHEMA_V2`, `SCHEMA_VERSION`).
- v1: stores `events` (with unique `eventId` index), `state`, and `snapshots`.
- v2: adds `games` store with non‑unique `createdAt` index for listing archived games.
- Migrations use `onupgradeneeded` with `oldVersion` guards to avoid redundant index creation. Upgrading from v1→v2 only creates the `games` store/index and preserves existing data.
