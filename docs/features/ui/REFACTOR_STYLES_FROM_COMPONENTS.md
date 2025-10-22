# Refactor Styles From Components (Scoped Sass Modules)

Purpose: Replace Tailwind utility classes with colocated Sass modules so components stay small, readable, and debuggable while preserving theming and design tokens. This document lays out the target styling architecture, tooling updates, migration process, and quality bars for rolling the change across the app with minimal risk.

Scope: All React components rendered by Next.js (app router, RSC and client components). Existing design tokens, light/dark themes, and Radix/shadcn primitives must continue to work. The refactor should avoid introducing additional runtime styling libraries or bespoke build steps beyond Sass compilation supported by Next.js.

## Guiding Principles

- **Separation with proximity**: Keep markup and styles in the same directory (`Component.tsx` + `Component.module.scss`) while separating concerns.
- **Readable DOM**: Prefer clear class names (`.button`, `.scoreRow`) surfaced in the browser devtools instead of hashed utility mashups; expose semantic CSS module identifiers during development.
- **Small components**: Push conditional styling logic into Sass modules and shared mixins so component files stay focused on behavior.
- **Token-first theming**: Drive all colors, typography, spacing, and radii from shared design tokens compiled to CSS custom properties.
- **Progressive migration**: Maintain Tailwind alongside Sass during the transition, landing incremental PRs with full test coverage.
- **Zero extra runtime**: No styled-components, Emotion, or runtime CSS-in-JS; rely on static Sass compilation and CSS modules.

## Target Styling Architecture

### Colocated Sass Modules

- Each component gets a sibling stylesheet: `components/<Feature>/<Component>.module.scss`.
- Import classes via `import styles from './Component.module.scss';` and reference with `className={styles.component}`.
- Use descriptive block-level selectors (`.component`, `.section`, `.title`, `.listItem`). For shared modifiers prefer data attributes (`[data-state='open']`) over chained classes.
- Leverage Sass nesting sparingly to keep selectors shallow (max depth 2) and maintain readability.

### Shared Style Toolkit (`styles/`)

- `styles/tokens/`: Generated Sass maps for design tokens (colors, spacing, typography, radii, motion). A build script reads the existing Tailwind theme configuration and emits synchronized Sass partials plus TypeScript JSON so the values stay single-sourced.
- `styles/themes/`: Theme definitions emitting CSS custom properties via `:root[data-theme='light'] { --color-bg: ... }`.
- `styles/mixins/`: Common mixins/placeholders for layout (`flex-center`), typography (`heading-sm`), state styling (`focus-ring`), and responsive helpers (e.g., `respond('md')`) that mirror Tailwind’s breakpoint semantics.
- `styles/base.scss`: Imports a generated Tailwind Preflight snapshot and layers project-specific resets (typography, scrollbars, Radix overrides). The snapshot comes from running the Tailwind CLI against our config with only `@tailwind base;`, ensuring we carry forward all base styles automatically.
- `styles/global.scss`: Imports base, tokens, theme generators, and registers a minimal root layout. Loaded once in `_app.tsx` (app router `layout.tsx`).

### Theme and Token Flow

1. Run `pnpm tokens:sync` (or the watch mode equivalent) to invoke a generator script that consumes the existing Tailwind theme via `resolveConfig`, hydrates our token schema, and emits:
   - Sass partials under `styles/tokens/` (e.g., `_colors.scss`, `_spacing.scss`, `_typography.scss`).
   - A committed `tokens.json` for TypeScript consumers and any legacy Tailwind token readers.
   - A checksum file (e.g., `.cache/tokens.hash`) so CI can detect drift between the authoritative Tailwind theme and the generated artifacts.
2. Use generator mixins to emit CSS variables for each theme:
   ```scss
   // styles/themes/_light.scss
   @use '../tokens/colors' as colors;
   @include colors.emit-theme('light');
   ```
3. Attach generated vars to `:root[data-theme='light']` / `:root[data-theme='dark']`. Themes stay compatible with `next-themes` provider.
4. Keep `pnpm tokens:watch` running alongside `pnpm dev` so edits to `tailwind.config.*` or token mapping overrides hot-refresh the Sass/JSON output. `pnpm build` runs the one-shot generator and fails if the committed artifacts don't match the Tailwind source.
5. When Tailwind is removed in Phase 4, the generator flips to using the Sass token maps as the new source of truth without requiring component changes.

### Component Consumption Pattern

- Reference tokens via CSS custom properties inside modules, e.g. `color: var(--color-text-muted);`.
- For component variants, use class composition in Sass:

  ```scss
  .button {
    @include typography.button;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--color-action-primary-bg);
    color: var(--color-action-primary-fg);
    transition:
      background 150ms ease,
      box-shadow 150ms ease;

    &:hover {
      background: var(--color-action-primary-bg-hover);
    }

    &[data-variant='ghost'] {
      background: transparent;
      color: var(--color-action-ghost-fg);
    }
  }
  ```

- Keep module files <150 lines; split out `_variants.scss` partials if a component needs richer styling.

### Extension & Overrides

- Retain `className` props during the migration window for backwards compatibility, but codemod existing call sites to variants, spacing props, or dedicated override hooks so no Tailwind utilities remain at call sites once the component flips to Sass.
- Create an ESLint rule (Phase 1) that forbids Tailwind token usage in `className`, template literals, or `cn()` arguments unless they are explicitly whitelisted CSS module identifiers; turn it on in `warn` mode initially and ratchet to `error` before Phase 4.
- Where one-off overrides are still required, expose `data-slot` hooks (e.g., `data-slot="icon"`) and document how to target them from feature-specific Sass modules instead of reintroducing Tailwind utilities.

## Tooling & Build Changes

1. **Install Sass**: Add `sass` (or `sass-embedded` when stable) as a dev dependency. Next.js automatically handles `.module.scss` files.
2. **Tailwind Preflight Snapshot**: Add a `pnpm preflight:snapshot` script that invokes the Tailwind CLI with our current config and a minimal entry containing `@tailwind base;`. Commit the generated `styles/generated/preflight.css` and import it from `styles/base.scss` so the reset stays in lockstep with Tailwind releases.
3. **PostCSS Cleanup**: After all components migrate, remove Tailwind plugins from `postcss.config.mjs` while retaining autoprefixer. Until then, keep the Tailwind plugin to support the snapshot script without affecting runtime bundles.
4. **Linting**: Extend ESLint import rules to allow `.module.scss`. Optional: add Stylelint later, but not required for the initial migration.
5. **TypeScript**: Update `next-env.d.ts` if necessary to include `declare module '*.module.scss';` (only if missing).
6. **CSS Module Identifiers**: Keep Next.js defaults in production for cacheability; optionally set `css-loader` `localIdentName` to `[path][name]__[local]` in development via the existing webpack hook, but gate it behind a feature flag so Turbopack remains unaffected.
7. **Token Export Automation**: Implement paired scripts—`pnpm tokens:sync` (one-shot) and `pnpm tokens:watch` (long-running)—that consume the Tailwind theme and emit Sass + JSON outputs. Hook `tokens:watch` into `pnpm dev` and fail `pnpm build` when generated files drift.
8. **Test Runner Support**: Update `vitest.config.mts` and Storybook to stub `.module.scss` imports before the first migration PR to avoid Tailwind-to-Sass regressions in unit stories.
9. **Bundle Vetting**: Track bundle size in CI to ensure removing Tailwind lowers CSS payload and no regressions appear.

## Migration Plan

### Phase 0 – Prep

- Run a multi-pass inventory for Tailwind usage: start with grep (`rg -n "className" components app`), then run the Tailwind class-name codemod/ESLint rule (to be added in this phase) so template literals, arrays, `cn()` helpers, and content files surface in the migration checklist.
- Inventory shared utility classes (`lib/utils`, `clsx`, `cva`) to understand replacements.
- Lock baseline screenshots or Percy snapshots to guard against visual drift.
- Run `pnpm preflight:snapshot` and commit `styles/generated/preflight.css` so everyone starts from the same Tailwind reset baseline before touching components.

### Phase 1 – Infrastructure

- Add Sass dependency and bootstrap `styles/` directory with tokens, themes, and base imports.
- Wire global styles in the Next.js root layout.
- Ensure `next-themes` toggles `data-theme` on `<html>` or `<body>` for variable switching.
- Land responsive breakpoint mixins and document their usage so Sass modules can replace existing Tailwind `sm:`/`lg:` patterns without regressions.
- Configure CSS module identifier patterns (readable in dev, hashed in prod) and document the expectation in `docs/conventions.md`.
- Update `vitest.config.mts`/Storybook aliases so `.module.scss` imports resolve during tests before migrating any component.
- Document class naming and module usage in `docs/conventions.md` (or update existing style guide).
- Implement the Tailwind class-name ESLint rule/codemod and add it to CI in `warn` mode so residual utility usage surfaces as components begin to migrate.
- Wire the Tailwind token generator into the dev server (`pnpm dev` runs `tokens:watch` alongside Next.js) and add CI jobs that run both `pnpm tokens:sync` and `pnpm preflight:snapshot` followed by `git diff --exit-code` to catch drift automatically.
- Import `styles/generated/preflight.css` inside `styles/base.scss` and confirm the global stylesheet order keeps Tailwind base before Sass modules during the hybrid phase.

### Phase 2 – Token & Theme Implementation

- Land the Tailwind-driven token generator output in the repo (Sass partials + `tokens.json`) and verify parity against the source config by snapshotting a few representative tokens in unit tests.
- Generate CSS variables for light & dark themes; verify `ThemeToggle` reflects new vars.
- Provide fallbacks for consumers still reading Tailwind config (temporary TypeScript shim pointing to the generated `tokens.json`).
- Confirm `pnpm tokens:watch` hot-reloads during development and that CI enforces `pnpm tokens:sync` before builds.

### Phase 3 – Component-by-Component Migration

- Prioritize foundational UI (`Button`, `Input`, layout shells) because many components depend on them.
- For each component:
  1. Create `Component.module.scss` with styles derived from existing Tailwind semantics.
  2. Replace `className` strings or `cn()` compositors with module references.
  3. Remove unused Tailwind utilities and update snapshot tests.
  4. Confirm accessibility states (focus, disabled, error) ported via mixins.
  5. Re-create responsive behavior with the shared breakpoint mixins and validate against baseline screenshots across supported widths.
- Maintain deterministic layering by loading Tailwind-generated global CSS (Preflight + any remaining utility layers) ahead of `styles/global.scss` in `app/layout.tsx` and restricting new Sass modules to scoped selectors. Delete Tailwind class usage for a component only after confirming no residual cascade dependencies exist.
- For shadcn/Radix primitives that currently ship with Tailwind class lists, fork them into `components/ui/` counterparts early in Phase 3, restyle them with Sass modules, and deprecate the original Tailwind exports so the shared primitives are safe to use once Tailwind is removed.
- Optional staging: when a component is too large for a single pass, extract its Tailwind strings into a temporary `Component.styles.ts` file exporting named class tokens. Migrate those tokens to Sass in the next PR and delete the staging file immediately after.
- Track progress in a checklist (e.g., `/docs/migrations/styling.md`) and land frequent PRs (<500 line diffs).

### Phase 4 – Cleanup

- Remove Tailwind config (`tailwind.config`), PostCSS Tailwind plugin, and `tailwind-merge` dependencies.
- Delete utility helpers that only existed for Tailwind class composition (`cn`, `cva` variants) once all consumers migrate, while retaining any generic class-merging helper that Sass modules still rely on.
- Regenerate bundle analysis to confirm reduction.
- Update developer docs and onboarding materials.
- Flip the Tailwind ESLint rule to `error` and confirm the migration checklist shows zero remaining Tailwind tokens (components, MDX content, or runtime class generators) before uninstalling the library.

## Quality Gates

- Unit/visual tests updated for each migrated component.
- Lint + typecheck + Vitest must pass locally and in CI.
- Manual QA checklist per page: verify theming, responsive breakpoints, interactive states.
- CI runs `pnpm preflight:snapshot` and fails on diff so Tailwind Preflight parity is enforced automatically before unshipping Tailwind.
- Monitor runtime warnings for missing CSS modules during canary deploys.

## Operational Considerations

- Coordinate with design to validate token mapping early; lock naming before mass migration.
- Keep PRs scoped to a single feature or component cluster to ease review.
- During mixed mode, avoid importing Tailwind and Sass styles into the same component to prevent precedence bugs.
- Document any global overrides applied to Radix primitives to avoid regressions when Tailwind is removed.
- Audit MDX/CMS/Markdown content that currently leans on Tailwind utility classes and define replacement strategies (global prose styles, dedicated wrappers) before the final Tailwind removal.

## Appendix: Example Button Refactor

```tsx
// components/ui/Button.tsx
import { forwardRef } from 'react';
import styles from './Button.module.scss';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', ...props }, ref) => (
    <button
      ref={ref}
      data-variant={variant}
      className={`${styles.button} ${className ?? ''}`.trim()}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
```

```scss
/* components/ui/Button.module.scss */
@use '../../styles/mixins/typography';

.button {
  @include typography.button;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  border: none;
  background: var(--color-action-primary-bg);
  color: var(--color-action-primary-fg);
  cursor: pointer;
  transition:
    background 150ms ease,
    box-shadow 150ms ease;

  &:hover {
    background: var(--color-action-primary-bg-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &[data-variant='ghost'] {
    background: transparent;
    color: var(--color-action-ghost-fg);
  }
}
```

This pattern keeps styles near components without cluttering JSX, surfaces meaningful class names for debugging, and uses shared tokens for consistency across themes.
