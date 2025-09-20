# Implementing Refactor Styles From Components

This implementation plan operationalizes `REFACTOR_STYLES_FROM_COMPONENTS.md`. It breaks the migration to scoped Sass modules into phased workstreams with clear validation gates, automation hooks, and human-in-the-loop checkpoints. Each phase ends with a local `pnpm lint`, `pnpm format`, `pnpm test`, plus manual verification before committing.

## Execution Workflow

- Capture an engineering journal entry at the end of each phase summarizing risks, follow-ups, and manual QA results; store under `docs/migrations/styling/phase-logs/`.
- Land work in short-lived branches per phase. After validations pass, request human review to run an interactive build, smoke the UI, and sign off before merging.
- Keep Tailwind and Sass in mixed mode until Phase 4; no component may ship with both Tailwind utilities and Sass module classes in the same `className` prop.

## Phase Overview

| Phase | Theme                     | Highlights                                                                                      |
| ----- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| 0     | Baseline guardrails       | Confirm tooling, performance budgets, and Tailwind parity snapshots before touching components. |
| 1     | Token sync pipeline       | Stand up the Tailwind-driven token generator and theme emitters feeding Sass modules.           |
| 2     | Shared toolkit foundation | Build shared mixins, base styles, and migration-safe global wiring.                             |
| 3     | Component migration       | Incrementally port components to Sass modules with exhaustive validation.                       |
| 4     | Tailwind retirement       | Remove unused utilities, shrink bundles, and finalize documentation.                            |

## Phase 0 – Baseline Guardrails

### Key Tasks

- Inventory Tailwind usage by running a scripted analysis (`rg --no-heading 'className=.*"' -g"*.tsx" components app`) and recording counts per component in `docs/migrations/styling/baseline-matrix.csv`.
- Capture bundle and performance baselines using the existing `pnpm build && pnpm next export` workflow plus Web Vitals from the landing page; store artifacts under `docs/migrations/styling/baseline-metrics/`.
- Add a failing test in `tests/ui/landing-snapshots.test.ts` that asserts Tailwind classes still render in a representative component (guard against premature removal) and skip it once the component is migrated.
- Wire a Playwright smoke subset (headless, CI-only) that screenshots `app/landing`, `app/single-player`, and `app/settings`; commit the baseline snapshots for future diffing.
- Document the cross-functional review cadence with Design and QA in `docs/migrations/styling/communication.md` so stakeholders expect weekly demos.

### Validation

- `pnpm lint`
- `pnpm format`
- `pnpm test`
- Human validation: confirm baseline metric files exist, review Tailwind inventory accuracy, and approve the Playwright snapshot output.

## Phase 1 – Token Sync Pipeline

### Key Tasks

- Implement `scripts/tokens/sync.ts` that consumes `tailwind.config.ts` via `resolveConfig` and emits Sass partials under `styles/tokens/` plus a mirrored `styles/tokens.json` for TypeScript consumers; include Vitest coverage for the generator’s diff detection.
- Add `pnpm tokens:sync` and `pnpm tokens:watch` scripts mirroring our existing tooling conventions (`package.json` scripts section, plus documentation in `README.md`).
- Create theme emitters (`styles/themes/_light.scss`, `_dark.scss`) that leverage generated mixins and register CSS variables on `:root[data-theme=...]`; prove parity with Tailwind values using snapshot tests in `tests/unit/tokens/theme-emitters.test.ts`.
- Extend CI (`.github/workflows/test.yml`) to run `pnpm tokens:sync` in check mode and fail on uncommitted diffs by hashing the generated directory.
- Update developer onboarding docs (`docs/ONBOARDING.md`) with instructions for running the token sync watch mode during local development.

### Validation

- `pnpm lint`
- `pnpm format`
- `pnpm test`
- Human validation: run `pnpm tokens:sync`, inspect generated Sass maps for token naming parity, and smoke-test theme switching in the dev server.

## Phase 2 – Shared Toolkit Foundation

### Key Tasks

- Create `styles/mixins/` with typography, layout, state, and breakpoint helpers derived from Tailwind semantics; include unit tests in `tests/unit/styles/mixins.test.ts` validating generated CSS.
- Port Tailwind Preflight to `styles/base.scss` using the snapshot produced in Phase 0 and layer project-specific resets; add a contract test ensuring Radix overrides (focus rings, dialog stacking) remain intact.
- Introduce `styles/global.scss` and import it from `app/layout.tsx`; guard with a smoke test (`tests/ui/global-styles.test.tsx`) that renders the app shell and asserts root CSS variables exist.
- Audit Radix and shadcn components under `components/ui/`; ensure any that still depend on Tailwind get interim wrapper utilities so the migration away from Tailwind does not regress focus management.
- Stand up a lint rule (custom ESLint plugin) that prevents importing Sass modules from outside the component boundary, preserving folder encapsulation.

### Validation

- `pnpm lint`
- `pnpm format`
- `pnpm test`
- Human validation: verify global styles load without duplicate preflight entries, review mixin naming for consistency with design tokens, and approve the ESLint rule behavior inside VS Code.

## Phase 3 – Component Migration

### Key Tasks

- Migrate components in batches (target 5–7 per PR) following feature affinity: start with shared primitives (`components/ui`), then top-level layouts, then feature flows; track progress in `docs/migrations/styling/migration-checklist.md` with owner, date, and screenshot links.
- For each component, create `<Component>.module.scss`, translate Tailwind utilities to mixin-driven Sass, and replace `className` strings with module references; run Storybook or existing unit snapshots to capture before/after states.
- Ensure responsive behavior by using the shared breakpoint mixins; add JSDOM unit tests where needed to assert data attributes or modifier classes toggle correctly without Tailwind (`tests/ui/...` updates).
- Validate dark mode and high contrast by running the Playwright smoke suite with forced color-scheme overrides; document any tokens that require design feedback.
- Remove `tailwind-merge` usage per component as it migrates, replacing it with deterministic module class assembly or conditional arrays.

### Validation

- `pnpm lint`
- `pnpm format`
- `pnpm test`
- Human validation: perform manual QA for each migrated page (light/dark themes, responsive widths, keyboard focus) and sign off on the migration checklist entry.

## Phase 4 – Tailwind Retirement

### Key Tasks

- Delete Tailwind configuration, PostCSS references, and unused dependencies (`tailwindcss`, `tailwind-merge`, `tailwindcss-animate`); ensure `pnpm install` produces a clean lockfile diff.
- Replace global Tailwind imports (`app/globals.css`, legacy `@tailwind` directives) with the Sass equivalents, and confirm no residual `.css` imports reference Tailwind utilities.
- Flip the ESLint Tailwind rule from warning to error and add CI enforcement that fails on any residual `className` strings containing Tailwind tokens.
- Refresh the bundle analysis (`pnpm build && ANALYZE=true next build`) and compare against Phase 0 metrics; record improvements in `docs/migrations/styling/baseline-metrics/reduction.md`.
- Update developer documentation (`README.md`, `docs/STYLE_GUIDE.md`, design hand-off docs) to reflect the Sass-first workflow and remove Tailwind-specific guidance.

### Validation

- `pnpm lint`
- `pnpm format`
- `pnpm test`
- Human validation: run through a production build preview (`pnpm build && pnpm start`), confirm theme toggles continue to work, verify bundle diff reductions, and sign off on documentation accuracy.
