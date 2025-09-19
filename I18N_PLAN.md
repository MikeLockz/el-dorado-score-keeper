# Internationalization Implementation Plan

This plan outlines the phased approach to internationalize the El Dorado Score Keeper (Next.js App Router, React) while preserving UX and performance. Each phase includes concrete tasks, recommended tooling, and validation steps to deliver a resilient multilingual experience.

## Phase 0 – Discovery & Baseline Readiness

- **Objectives**: Document current locale assumptions, audit text and formatting hotspots, align stakeholders on scope.
- **Tasks**
  - Inventory all user-facing text (screens, modals, emails, config). Flag hard-coded strings, concatenations, embedded HTML.
  - Map existing date/number/currency usage (score displays, stats, leaderboards) and detect locale-sensitive logic.
  - Identify routing/SEO implications (localized routes, metadata) and analytics requirements.
  - Agree on target locales, fallback behavior, and minimum viable localization coverage.
- **Tools & Libraries**: `rg` for text discovery, design handoff docs, analytics dashboards, existing test suites.
- **Testing Strategy**: Snapshot baseline UI; note critical flows for later regression.
- **Validation**: Shared audit report; sign-off from product/design on scope, locales, and phased rollout expectations.

## Phase 1 – i18n Infrastructure & Tooling

- **Objectives**: Establish internationalization foundation without user-visible changes.
- **Tasks**
  - Adopt `next-intl` (supports App Router, SSR/SSG, routing, ICU syntax) as primary i18n framework.
  - Create `i18n/config.ts` for locale metadata (default locale, supported locales, directionality, number/date formats).
  - Set up per-locale message bundles (`/locales/{locale}.json`) with lazy loading via Next dynamic imports to keep bundle size lean.
  - Wire middleware for locale detection/order (accept-language header, persisted preference, URL segment).
  - Introduce `<IntlProvider>` wrapper at root layout, ensure server/client harmony.
  - Configure linting guardrails: `eslint-plugin-i18next/no-literal-string` (or custom rule) for JSX/TSX.
  - Decide translation management workflow (e.g., Crowdin, Phrase, Locize, or Git-based). Draft glossary and key naming conventions.
- **Tools & Libraries**: `next-intl`, `@formatjs/intl-localematcher`, `eslint-plugin-i18next`, Next.js middleware, chosen TMS API/CLI.
- **Testing Strategy**: Unit tests (Vitest + React Testing Library) for provider setup and locale resolver; snapshot tests for layout unaffected.
- **Validation**: CI passes with lint rules enabled; verifying default locale renders unchanged UI; bundle analysis showing negligible growth.

## Phase 2 – Text Extraction & Component Integration

- **Objectives**: Externalize strings and integrate translation hooks systematically.
- **Tasks**
  - Prioritize top-level routes/pages; migrate text to message keys using `useTranslations`/`getFormatter` from `next-intl`.
  - Replace string concatenation with ICU messages (pluralization, gender, rich formatting) to avoid runtime branching.
  - Build shared helpers for common patterns (notifications, buttons) to reduce duplicate keys.
  - Create scripts to detect untranslated keys and orphan messages (e.g., `pnpm i18n:check`).
  - Update documentation specifying naming conventions, interpolation patterns, markdown vs. rich text handling.
- **Tools & Libraries**: `next-intl` helpers, custom `scripts/check-missing-translations.ts`, ESLint autofixers.
- **Testing Strategy**: Component/unit tests verifying keys resolve; storybook/Chromatic visual diff (if available) per locale; ensure fallback text absent.
- **Validation**: PR check requires zero untranslated keys in default locale; manual review of key naming consistency; maintain snapshot parity.

## Phase 3 – Locale Routing, Switching & Persistence

- **Objectives**: Enable users to change locales seamlessly while keeping routing, SEO, and analytics intact.
- **Tasks**
  - Implement locale-prefixed routes (`/en/...`, `/es/...`) via Next.js i18n routing, with middleware rewrite for legacy URLs.
  - Add locale switcher UI (header/footer, user settings) that persists choice (cookie/local storage) and respects server rendering.
  - Ensure localized metadata (`generateMetadata`) and Open Graph tags.
  - Update sitemap and canonical URLs per locale; integrate hreflang tags.
  - Coordinate analytics tagging to capture locale context.
- **Tools & Libraries**: Next.js routing APIs, `next-sitemap`, analytics SDKs, cookies/local storage utilities.
- **Testing Strategy**: Integration tests for navigation (Playwright or Cypress); manual cross-browser verification of locale persistence; SEO audit with Lighthouse.
- **Validation**: Locale switch updates URL and content without reload artifacts; SEO tools report distinct localized pages; analytics dashboards reflect locale dimension.

## Phase 4 – Localization of Formats & Data Pipelines

- **Objectives**: Standardize locale-aware formatting for numbers, dates, times, currencies, and measurement units.
- **Tasks**
  - Replace manual formatting with `next-intl` formatters (`formatNumber`, `formatDate`, `formatList`); centralize currency/score formatting helpers.
  - Audit API/backend payloads for locale-sensitive data; pass locale context when needed (e.g., server actions, edge functions).
  - Introduce locale-aware validation (e.g., input parsing, decimal separators) and fallbacks for unsupported variants.
  - Ensure accessibility: screen readers receive localized labels/aria attributes.
  - Document performance safeguards (memoized formatters, avoid heavy polyfills, leverage `Intl` built-ins).
- **Tools & Libraries**: `Intl` APIs, shared formatting utilities, Zod validators with locale hooks, optional polyfills for legacy browsers (load only when required).
- **Testing Strategy**: Unit tests for formatting utilities across locales; regression tests for form submissions; accessibility checks with Axe.
- **Validation**: Cross-locale review of high-visibility data (scores, dates); performance profiling (Next dev tools, WebPageTest) ensuring no significant bundle increase; accessibility audit passes.

## Phase 5 – Translation Workflow, Quality Assurance & Rollout

- **Objectives**: Operationalize translation delivery, monitor quality, and roll out to production gradually.
- **Tasks**
  - Integrate CI pipeline with TMS (push/pull strings via API). Automate message extraction/upload and translation download.
  - Establish review loops (internal linguists or vendor QA) and glossary enforcement.
  - Set up fallback and pseudo-localization builds to catch truncation/rtl issues.
  - Implement runtime error logging for missing translations and unexpected locale codes.
  - Plan staged deployment (feature flag or locale-by-locale enablement) and release communications.
  - Train support and QA teams on locale testing flows.
- **Tools & Libraries**: Chosen TMS CLI/API, `intl-messageformat-parser` for pseudo-localization, feature flag service (e.g., LaunchDarkly), logging/monitoring stack.
- **Testing Strategy**: End-to-end flows in each locale; pseudo-locale regression; real-device smoke tests; compare analytics KPIs across locales post-launch.
- **Validation**: Zero missing translation alerts in logs; stakeholder sign-off after pilot locale launch; update documentation for maintenance.

## Phase 6 – Maintenance & Governance

- **Objectives**: Keep the i18n system healthy, scalable, and consistent as the product evolves.
- **Tasks**
  - Add documentation to onboarding guides; include i18n checklist in PR template.
  - Schedule quarterly audits for unused keys and locale coverage; prune dead translations.
  - Monitor bundle sizes; enforce guardrails (e.g., per-locale message size budgets) and dynamic loading reports.
  - Keep dependencies (`next-intl`, tooling) updated; run automated tests on upgrade.
  - Collect user feedback per locale; feed into continuous improvement backlog.
- **Tools & Libraries**: Custom dashboards, bundle analyzer (`next-bundle-analyzer`), GitHub Actions for automated audits.
- **Testing Strategy**: Continuous integration checks for translation completeness; periodic smoke tests in all locales; evaluate synthetic monitoring alerts.
- **Validation**: Leadership review of i18n health metrics; maintain SLA for translation turnaround; ensure performance budgets remain intact.

---

Following this phased plan will enable the El Dorado Score Keeper to deliver a consistent, performant multilingual experience, with guardrails that keep translations accurate and maintainable over time.
