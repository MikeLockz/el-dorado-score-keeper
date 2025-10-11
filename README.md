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
- Optional debug source maps: `ENABLE_SOURCE_MAPS=1 pnpm dev:next` (leave unset for production builds).
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
- `observability:upload-source-maps`: Package generated source maps for upload (run after a build with `ENABLE_SOURCE_MAPS=1`).

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

## Routes & Deep Links

- `/` — Landing page with hero copy, quick links, and mode selectors for Single Player and Score Card.
- `/single-player` — Entry point that redirects to the active single-player run or the new-game flow when none exist.
- `/single-player/new` — Starts a fresh single-player game; routed modals at `/single-player/new/archive` and `/single-player/new/continue` confirm archival or resuming the current run.
- `/single-player/[gameId]` — Live single-player gameplay experience with tabbed sub-routes:
  - `/single-player/[gameId]/scorecard` — Read-only per-round recap for the same run.
  - `/single-player/[gameId]/summary` — Post-game analytics and achievements.
- `/scorecard` — Score Card hub that redirects to the latest session or setup.
- `/scorecard/[scorecardId]` — Active Score Card entry view with optional `/summary` export route.
- `/players` — Player management hub with `/players/[playerId]` detail routes and `/players/archived` for restores.
- `/rosters` — Roster management hub with `/rosters/[rosterId]` detail views and `/rosters/archived` for archived lineups.
- `/games` — Archived games list with `/games/[gameId]` detail pages and intercepted modal routes for restore/delete confirmations.
- `/rules` — Quick reference for bidding, scoring, and round flow.

### Landing (`/`) details

- Hero module introduces the app and routes into Single Player or Score Card using the active deep link.
- Mode cards detect in-progress sessions and swap between “New” and “Resume” actions.
- Quick Links surface the three most recent archived games and resume buttons that wait for state rehydration before navigating.
- “How to play” and settings links stay available even when state is still loading.

### Single Player (`/single-player` & `/single-player/[gameId]`) details

- Root layout resolves the correct destination: active game, archive confirmation, or the new-game flow.
- Dynamic layout renders shared tabs that mirror browser history across live, scorecard, and summary views.
- Each view rehydrates the selected `gameId` via the app state provider so deep links load without first visiting the landing page.
- Routed modals handle “archive & start new” and “continue current game” confirmations with analytics hooks.

### Score Card (`/scorecard` & `/scorecard/[scorecardId]`) details

- Round grid spans 10 rounds (tricks 10 → 1) with initials in the header and dense keyboard shortcuts.
- Action tiles cycle through bidding → complete → scored states; locked rounds prevent accidental edits.
- Bidding controls clamp between 0 and the available tricks for the round.
- Finalizing a round applies ±(5 + bid) and advances the next locked round to bidding.
- `/summary` renders an export-friendly recap suitable for printing or sharing.

### Players (`/players`) details

- Score Card and Single Player rosters live side-by-side with separate add/rename/reorder flows.
- Detail routes (`/players/[playerId]`) deep-link into inline editors for direct share links.
- Archived players surface under `/players/archived` with one-click restore actions.
- Persistence uses IndexedDB and mirrors updates across tabs.
- Devtools (development only) expose event height, preview state, and recent warnings.

### Rosters (`/rosters`) details

- Manage saved lineups with ordering, cloning, and archive/restore flows.
- `/rosters/[rosterId]` detail routes open the roster inline for editing or loading into a session.
- Archived rosters are available directly at `/rosters/archived` without toggling in-page filters.

### Games (`/games`) details

- Table lists archived games with title, completion time, player count, and winner summary.
- “New Game” launches the shared confirmation flow to archive and start fresh.
- List rows link to `/games/[gameId]` for analytics and history; intercepted modal routes handle restore/delete confirmations with focus management.

### Rules (`/rules`) details

- Overview: 10 rounds; tricks decrease 10 → 1; bid, mark made/missed, then finalize to apply points.
- Round flow: Bidding → Complete → Finalize; next locked round auto-unlocks to bidding.
- Scoring: Made = + (5 + bid); Missed = − (5 + bid).
- Notes: Round states cycle locked → bidding → complete → scored; locked rounds can’t advance; data persists locally and syncs across tabs.

### Missing entity surfaces

- `/single-player/[gameId]` renders **SinglePlayerGameMissing** when the requested run is unavailable, linking to `/single-player/new` and `/games`.
- `/scorecard/[scorecardId]` renders **ScorecardMissing** with CTAs to open the scorecard hub or browse archived games.
- `/players/[playerId]` and `/rosters/[rosterId]` render detail-specific missing cards that link back to active and archived lists.
- `/games/[gameId]` falls back to **ArchivedGameMissing**, offering a path back to `/games` or straight into `/single-player/new` for a fresh run.

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

## Single Player Persistence

- Every reducer-visible change writes an SP snapshot to IndexedDB (`STATE['sp/snapshot']`) and mirrors it to `localStorage` under `el-dorado:sp:snapshot:v1` with a trimmed `sp/game-index` map for deep links.
- Snapshot writes emit `single-player.persist.snapshot` metrics (duration, failure streak, adapter status) and log fallback usage via `single-player.persist.fallback` when the localStorage mirror rehydrates a session.
- When browser quota is exhausted the provider captures `sp.snapshot.persist.quota_exceeded`, surfaces an in-app warning toast, and continues retrying so progress resumes once space is available.

## Observability

New Relic Browser telemetry is opt-in. By default the app ships without telemetry until you enable the flag and supply browser credentials.

1. Duplicate `.env.local.example` to `.env.local` and provide sandbox values for `NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY`. Leave `NEXT_PUBLIC_OBSERVABILITY_ENABLED=false` until you are ready to validate.
2. Set `NEXT_PUBLIC_OBSERVABILITY_ENABLED=true` when you want to validate telemetry in the browser. Missing credentials keep the integration dormant.
3. New Relic ingest endpoints reject `localhost` origins. When you want telemetry locally, run `pnpm observability:proxy` (defaults to `http://localhost:5050`) and set `NEXT_PUBLIC_NEW_RELIC_BROWSER_HOST` to that URL; override the upstream or port with `NR_PROXY_TARGET` / `NR_PROXY_PORT` as needed.
4. Run `pnpm observability:smoke` to execute the lightweight readiness probe. The helper exits early with guidance when flags or credentials are absent.
5. The root layout wraps the app in `BrowserTelemetryProvider`, which lazily initialises the pluggable vendor registry and emits `page.viewed` events on navigation. Client components can call `captureBrowserException` / `captureBrowserMessage` from `lib/observability/browser` to record structured telemetry instead of `console.*`.

Cloudflare worker environments can copy `cloudflare/analytics-worker/.dev.vars.example` to `.dev.vars` and supply the equivalent New Relic credentials when worker traces are needed.

### Source map uploads

- Build with `ENABLE_SOURCE_MAPS=1` in CI to ensure Next emits `.map` artifacts.
- After `next build`, run `pnpm observability:upload-source-maps`.
- Configure the uploader via env vars:
  - `SOURCE_MAP_UPLOAD_PROVIDER=newrelic`
  - `NEW_RELIC_USER_API_KEY` (user API key)
  - `NEW_RELIC_BROWSER_APP_ID` (or `NEXT_PUBLIC_NEW_RELIC_BROWSER_APP_ID`)
  - `NEW_RELIC_SOURCE_MAP_BASE_URL` (public origin/base path that serves `_next/*` assets)
- Optional: `NEW_RELIC_SOURCE_MAP_RELEASE`, `NEW_RELIC_REGION` (set to `eu` for EU accounts)
- The script archives maps to `artifacts/` and uploads browser-visible assets to New Relic Browser for the specified release.
- The GitHub Pages deploy workflow (`.github/workflows/deploy.yml`) runs this uploader automatically on pushes to `main` when the required secrets/vars are present.
