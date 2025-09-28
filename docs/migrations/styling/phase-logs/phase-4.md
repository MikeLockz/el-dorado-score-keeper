# Phase 4 Log – 2025-09-30

## Summary

- Removed the Tailwind configuration and runtime wiring: deleted `tailwind.config.ts`, dropped the global Tailwind CSS import, and replaced the PostCSS pipeline with a lean autoprefixer-only config.
- Rehomed the canonical design tokens under `styles/tokens/design-tokens.ts` and updated the token sync script to read from the new source of truth.
- Uninstalled Tailwind-related dependencies (`tailwindcss`, `tailwind-merge`, `tailwindcss-animate`, `tw-animate-css`, `@tailwindcss/postcss`) and trimmed `pnpm-lock.yaml` so no Tailwind artifacts remain.
- Retired the Tailwind preflight generator, keeping the committed preflight snapshot and removing workflow steps and scripts that depended on Tailwind.
- Added the `no-tailwind/no-tailwind-classnames` ESLint rule to flag any residual utility class strings and refreshed documentation (`README.md`, `docs/ONBOARDING.md`, `docs/BUNDLE_SIZE.md`) to reflect the Sass-first workflow.

## Risks / Follow-ups

- Prettier still reports longstanding formatting drift across legacy files; the repo continues to skip `pnpm format` until the broader cleanup is scheduled.
- Known red Vitest suite (`tests/unit/game-flow/useNewGameRequest.test.tsx`) remains unresolved from prior phases; Tailwind removal did not introduce new failures but we still need a fix before merging.
- Sass warns about the legacy JS API during tests; follow-up to migrate to the modern Sass API (or upgrade tooling) once higher priority items are clear.

## QA Status

- `pnpm lint` ✅
- `pnpm format` ⚠️ (`prettier --check` fails on existing formatting diffs)
- `pnpm test` ⚠️ (fails on pre-existing `useNewGameRequest` cases; no new test regressions observed)
