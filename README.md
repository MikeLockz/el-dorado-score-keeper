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

Production build and run:

```bash
pnpm build && pnpm start
# or
npm run build && npm start
```

## Tech Stack

- Next.js 15 (App Router)
- React 19
- TypeScript
- Sass modules with token-driven theming
- Radix UI primitives + `lucide-react` icons
- Vitest for unit/integration tests

## Project Structure

- `app/`: App Router pages, layout, and styles
- `components/`: UI components and state provider
- `lib/`: State management, storage, and selectors
- `public/`: Static assets and PWA icons/manifest
- `styles/`: Global styles
- `tests/`: Unit, integration, and property tests (Vitest)

## Documentation

- **[Routes & Deep Links](docs/ROUTES.md)** - Complete application routing documentation
- **[Database Schema](docs/DATABASE_SCHEMA.md)** - IndexedDB schema and migration details
- **[Persistence](docs/PERSISTENCE.md)** - Single player data persistence implementation
- **[Analytics](docs/ANALYTICS.md)** - Analytics relay setup and configuration
- **[Observability](docs/OBSERVABILITY.md)** - New Relic Browser telemetry configuration
- **[Bundle Size](docs/BUNDLE_SIZE.md)** - Bundle analysis and optimization

## Scripts

- `dev`: Start Next.js in development mode
- `build`: Create a production build
- `start`: Run the production server (after `build`)
- `lint`: Run Next.js lint
- `test`: Run tests once with Vitest
- `test:watch`: Watch mode for tests
- `coverage`: Generate test coverage report
- `tokens:sync`: Regenerate Sass and JSON design token artifacts
- `tokens:watch`: Watch design token changes and regenerate artifacts

## Deployment

GitHub Actions workflow deploys to GitHub Pages on push to `main`.
