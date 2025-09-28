# Developer Onboarding

Welcome to the El Dorado Score Keeper project. This overview highlights the steps to get a local environment running and the background jobs you should keep in sync during development.

## Local Environment

1. Install dependencies with `pnpm install` (Node.js 18.18+ required, Node 20+ recommended).
2. Generate design token artifacts once after install by running `pnpm tokens:sync`.
3. Start the dev server with `pnpm dev`.

## Styling Token Workflow

The canonical design tokens live in `styles/tokens/design-tokens.ts`. To keep the generated Sass maps and JSON mirror up to date while you work:

- Run `pnpm tokens:watch` in a separate terminal to regenerate token artifacts whenever the design token catalog or generator scripts change.
- CI runs `pnpm tokens:sync -- --check`; commits must include updated artifacts and the `.cache/tokens.hash` file.

If `pnpm tokens:sync -- --check` reports drift, re-run `pnpm tokens:sync` before committing.

## Handy References

- `README.md` – project quickstart and script catalogue.
- `docs/migrations/styling/` – active styling refactor notes, baselines, and coordination cadences.
- `docs/migrations/styling/phase-logs/` – per-phase engineering journal entries.
