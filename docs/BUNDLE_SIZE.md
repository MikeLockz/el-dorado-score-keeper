**Bundle Size Optimization Plan**

- **Goal:** Reduce shipped JavaScript and CSS per route to improve startup time, interactivity, and hosting cost. Target initial route JS ≤ 80–120 kB gzip and keep subsequent route chunks ≤ 50 kB where feasible.
- **Scope:** Next.js 15 app router with static export (`output: 'export'`), Tailwind CSS v4, Radix UI components, `lucide-react` icons, client-side IndexedDB state.

**How We’ll Measure**

- **Bundle analyzer:** Add `@next/bundle-analyzer` to visualize per‑route chunks and third‑party impact.
  - Install: `pnpm add -D @next/bundle-analyzer`
  - Wrap config: `const withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: process.env.ANALYZE === 'true' });`
  - Export: `module.exports = withBundleAnalyzer(nextConfig)` (or adapt `export default` style).
  - Run: `ANALYZE=true pnpm build` then open `.next/analyze`.
- **Build stats guardrails:** Track total JS per route and vendor chunk size over time in CI (fail if thresholds regress by >10%).
- **Lighthouse + WebPageTest:** Verify Total Blocking Time (TBT) and JS execution time on mid‑range devices.

**High‑Impact Changes (Do First)**

- **Minimize `use client` scope:** Many pages/components are client (`rg -n "^'use client'" app components`). Convert top‑level pages to server components where possible and push interactivity into small client “islands”.
  - Pattern: keep `app/**/page.tsx` server by default; render small client components for controls that truly need state, effects, or browser APIs (e.g., IndexedDB calls).
  - Rationale: Server Components ship 0 kB of JS; every `use client` at the top of a large tree increases all descendant JS shipped.
- **Right-size providers in `app/layout.tsx`:** `ThemeProvider`, `StateRoot`, `Header`, and `Devtools` are client components. Only wrap routes that require them.
  - Move `StateRoot` to layouts or pages that actually read/write app state.
  - Gate `Devtools` by environment (already gated) and consider dynamic import in dev only.
- **Dynamic import heavy UI:** Use `next/dynamic` for non-critical, large, or infrequently used components.
  - Examples to lazy-load: Radix Dialog/Menu/Tooltip wrappers, mobile action menus, date pickers, any future charting/carousels.
  - Example:
    `const MobileActions = dynamic(() => import('./mobile-actions'), { ssr: false });`
- **Control route prefetching for large routes:** For links to heavy pages, use `prefetch={false}` on `next/link` to avoid background code downloads when offscreen.
- **Prune unused heavy deps:** These exist in `package.json` but are not imported: `recharts`, `react-day-picker`, `embla-carousel-react`, `cmdk`, `@vercel/analytics`.
  - Removing them reduces risk of accidental large imports and speeds CI. If you intend to use them later, prefer smaller alternatives or lazy‑load only where required.

**Library‑Specific Guidance**

- **Radix UI (@radix-ui/\*):**
  - Import only the primitives you use (already split by package).
  - Prefer conditional rendering or dynamic import for dialogs/menus/tooltips that are not visible on initial paint.
  - Avoid wrapping entire pages with components that attach global listeners.
- **Icons (lucide-react):**
  - Import icons by name: `import { Plus } from 'lucide-react'` is tree‑shaken. Avoid wildcard or dynamic icon loading.
  - If regression is observed, enable `modularizeImports` for per‑icon paths (see config snippet below).
- **Dates:** Prefer built‑in `Intl.DateTimeFormat` (already used in `lib/format.ts`). If you add `date-fns`, use modular imports enforced via `modularizeImports`.
- **Theming (next-themes):**
  - Keep provider as close to consumers as possible. Consider CSS `prefers-color-scheme` for static pages that don’t need runtime toggling.
  - If only a few routes need theme switching, isolate the provider to those routes.

**Next.js Configuration Tweaks**

- **Add modularized imports to enforce tree‑shaking:**
  - In `next.config.mjs`:
    - `modularizeImports: { 'date-fns': { transform: 'date-fns/{{member}}' }, 'lodash': { transform: 'lodash/{{member}}' }, 'lucide-react': { transform: 'lucide-react/icons/{{kebabCase member}}' } }`
    - Note: Confirm paths for `lucide-react` if enabling this; named ESM imports are typically sufficient.
- **Review `transpilePackages`:** Only transpile packages that truly break in legacy browsers; transpiling broad packages can inflate bundles.
- **Ensure minification/compression:** SWC minify is default. Host with gzip/brotli and long‑term caching for static chunks.

**Component and Code Patterns**

- **Avoid “barrel” re-exports for UI kits:** Re-exporting many components from a single index can disable tree‑shaking.
- **Eliminate dead code and dev helpers from prod:** Wrap dev‑only logic with `if (process.env.NODE_ENV !== 'production') { ... }` so it’s dropped.
- **Prefer smaller utilities over large deps:** For simple tasks (uuid, debounce), write local helpers instead of pulling multi‑KB libraries.

**Concrete To‑Dos for This Repo**

- **Audit and reduce `use client`:**
  - `app/games/page.tsx`, `app/settings/page.tsx`, and several components under `components/**` are fully client. Push client state and effects into leaf components. Keep list/table rendering server‑side when data allows.
  - Where IndexedDB is required, isolate only the data‑loading hook and interactive controls as client code; keep static table rows as server components fed by props (for static export, consider precomputed or cached snapshots where feasible).
- **Lazy‑load mobile action menus and overlays:** The mobile actions in `app/games/page.tsx` can be split into a dynamically imported island to keep the main table chunk small.
- **Header/Menu:** Split the Radix dropdown part of `components/header.tsx` into a dynamically imported component so the header itself stays lightweight.
- **Scope `StateRoot`:** Move it out of the root layout and into layouts/pages that actually need app state so routes that don’t interact with state ship less JS.
- **Remove unused deps:** If agreed, remove `recharts`, `react-day-picker`, `embla-carousel-react`, `cmdk`, and `@vercel/analytics` until needed.

**Sample Snippets**

- `next/dynamic` client island:
  `const HeavyPopover = dynamic(() => import('./heavy-popover'))`
  `// or disable SSR if it depends on window`
  `const HeavyPopover = dynamic(() => import('./heavy-popover'), { ssr: false })`
- `modularizeImports` in `next.config.mjs` (merge into your export):
  `const nextConfig = { modularizeImports: { 'date-fns': { transform: 'date-fns/{{member}}' }, 'lucide-react': { transform: 'lucide-react/icons/{{kebabCase member}}' } } }`
- `next/link` prefetch control:
  `<Link href="/games/view?id=123" prefetch={false}>Open</Link>`

**Verification Checklist**

- Run `ANALYZE=true pnpm build` and record:
  - Initial route total JS (gzip) and number of modules.
  - Largest third‑party contributors and where they are imported.
- After each change:
  - Confirm the affected route’s JS bytes decreased and no new vendor chunk grew unexpectedly.
  - Validate no UX regressions (menus, dialogs, theming still work).

**Longer‑Term Ideas**

- **Replace heavy charting/command palette libraries** with smaller, purpose‑built components if/when those features are added.
- **Islands‑first design:** Treat interactive parts as isolated client islands surrounded by server-rendered static UI.
- **Route budgets in CI:** Add a JSON of per‑route byte budgets and fail builds on regressions.

If you want, I can wire up the bundle analyzer and a first pass of `modularizeImports`, and draft a PR that scopes providers and splits the heaviest client pages into islands.
