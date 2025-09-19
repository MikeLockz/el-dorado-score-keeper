# Implementing Internationalization

This runbook translates the discovery audit (`docs/i18n_phase_0_discovery.md`) and strategic plan (`I18N_PLAN.md`) into an executable implementation program for the El Dorado Score Keeper. The phases below assume a Next.js App Router stack with Vitest, Prettier, and ESLint guardrails already in place. Each phase ends with concrete validation, including repository hygiene (`npm run lint`, `npm run format`, `npm test`) to enforce maintainability.

## Phase Prioritization Assessment

| Phase                                | Impact | Effort | Risk | Rationale                                                                                                                      |
| ------------------------------------ | ------ | ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1. Foundation & Guardrails           | 5      | 3      | 3    | Unlocks safe extraction, enforces no-regression linting, and keeps default UX stable.                                          |
| 2. Text Extraction & Catalog         | 5      | 5      | 4    | Largest surface area; touches every high-visibility screen listed in discovery. Requires strong tooling and review discipline. |
| 3. Locale-aware Formatting & Helpers | 4      | 3      | 3    | Centralizes number/date logic to avoid drift and ensures score displays stay correct across locales.                           |
| 4. Routing, SEO, and Persistence     | 4      | 4      | 4    | Direct user-visible change with SEO implications; depends on Phase 1 infra and Phase 2 messages.                               |
| 5. Translation Workflow & Rollout    | 4      | 3      | 3    | Operationalizes TMS integration, pseudo localization, and staged launches; mitigates missing-string regressions.               |
| 6. Maintenance & Governance          | 3      | 2      | 3    | Keeps i18n healthy long term; relies on earlier phases delivering robust telemetry and documentation.                          |

Score key: 1 (lowest) to 5 (highest). Ordering reflects impact-to-effort ratio with risk tempered by guardrails from previous phases. Phase 0 discovery is complete and provides the baseline evidence for these scores.

---

## Phase 0 - Discovery (Complete)

- **Goal**: Capture current localization posture, hotspots, and stakeholder decisions. Output is frozen in `docs/i18n_phase_0_discovery.md`.
- **Status**: Complete. Use as a reference for extraction prioritization and glossary governance.
- **Validation Artifact**: Discovery report reviewed with product, design, and engineering leadership. No additional work required before Phase 1.

---

## Phase 1 - Foundation & Guardrails

### Objectives

- Introduce `next-intl` scaffolding without changing rendered copy.
- Centralize locale metadata and detection to unblock later phases.
- Enforce linting guardrails that prevent new hard-coded strings.

### Entry Criteria

- Phase 0 discovery accepted and shared with delivery teams.
- Product has confirmed default locale (`en-US`) and initial rollout locales (`es-ES`, `fr-FR`, `de-DE`).

### Implementation Tracks

- Create `i18n/config.ts` defining supported locales, direction, formatter defaults, and reusable helpers (date, number, list formatters).
- Configure middleware for locale resolution using Accept-Language, stored preference, and URL prefix order. Persist selection via cookie for SSR parity.
- Wrap root layout with `<IntlProvider>` from `next-intl`; ensure server and client components use shared config.
- Scaffold locale message folders (`/locales/{locale}.json`) with lazy loading (dynamic import per route) to protect bundle size.
- Enable lint rule (e.g., `eslint-plugin-i18next/no-literal-string`) in JSX/TSX and add repo docs for suppressions.
- Document translation key conventions and glossary linkage. Include translator notes for typographic glyphs uncovered during discovery.

### Best Practices & Performance

- Keep config typed to avoid drift (use a `const SUPPORTED_LOCALES` tuple and derived types).
- Memoize formatter helpers and reuse across server and client to prevent reallocation during renders.
- Adopt dynamic imports for large locale bundles; ensure tree-shaking by exporting per-locale modules.
- Follow existing Next.js App Router patterns for middleware and layout structure.

### Testing & QA

- Unit tests for locale resolver middleware, ensuring header, cookie, and URL precedence behave as expected.
- Component tests verifying default locale renders identical snapshots pre/post phase.
- Add guard tests for `getIntl()` helpers to ensure required messages exist.
- All new code must include tests (Vitest + React Testing Library).

### Validation Checklist

- [ ] Default locale pages render unchanged (visual diff or Chromatic, if available).
- [ ] Added ESLint rule blocks new literal strings; CI demonstrates failure on intentional violation.
- [ ] `npm run lint`
- [ ] `npm run format`
- [ ] `npm test`
- [ ] Documentation of config and lint rules merged (e.g., README or contributing guide update if needed).

Exit gating: sign-off from staff engineering and product that Phase 1 introduced no user-visible regressions and established the guardrails needed for extraction.

---

## Phase 2 - Text Extraction & Catalog Integration

### Objectives

- Externalize user-facing strings into locale catalogs, starting with high-traffic routes from discovery.
- Replace concatenated strings with ICU messages and shared helpers.
- Automate detection of untranslated or orphaned keys.

### Entry Criteria

- Phase 1 infrastructure merged with linting guardrails active.
- Glossary and key naming conventions ratified with product/design and stored in TMS.

### Implementation Tracks

- Prioritize extraction according to discovery hotspots: root layout metadata, navigation, landing experience, scorecard views, game archive, player management, settings, rules content, developer pages (as scoped).
- Use `useTranslations`/`getTranslations` hooks for components; replace interpolated strings with ICU syntax (`{round, number}` etc.).
- Build shared components or helper modules for repeated phrases (e.g., round-state chips, dialog prompts) to avoid duplicated keys.
- Implement script `scripts/i18n-check.ts` (or similar) to fail CI on missing keys in default locale and log unused keys.
- Add translator notes for non-ASCII glyphs (ellipsis, non-breaking hyphen, suit symbols) to preserve semantics.

### Best Practices & Performance

- Keep message IDs stable (namespace per route or feature) to simplify TMS diffs.
- Avoid nesting formatted React nodes directly in messages; prefer rich text helpers from `next-intl` with component maps.
- Limit catalog size per route by colocating messages (`app/<route>/messages/en.json`) and aggregating via loader.
- Review extraction PRs with copy owners to ensure glossary compliance.

### Testing & QA

- Update component/unit tests to assert on message keys rather than literal English strings where practical.
- Refresh snapshots after confirming localized output matches expectations; maintain one canonical locale (English) in tests unless multi-locale coverage is absolutely required.
- Add tests for scripts that detect missing translations (mock filesystem).
- Enforce new tests for any helper introduced during extraction.

### Validation Checklist

- [ ] High-priority routes from discovery render via locale catalogs with no console warnings.
- [ ] `scripts/i18n-check` integrated into CI or `npm run check`.
- [ ] Translator notes committed for glyph-sensitive strings.
- [ ] `npm run lint`
- [ ] `npm run format`
- [ ] `npm test`
- [ ] Stakeholder demo showing string coverage and linting workflow.

Exit gating: product/design approval that migrated copy matches source meaning; engineering confirms zero missing default-locale keys in CI.

---

## Phase 3 - Locale-aware Formatting & Domain Helpers

### Objectives

- Centralize number, currency, date, duration, and list formatting with explicit locale awareness.
- Ensure game-specific logic (round labels, suit names) respects locale rules and typographic requirements.

### Entry Criteria

- Phase 2 catalogs established with stable key usage.
- Agreement with product on formatting expectations per locale (currency style, decimal separators, duration format, etc.).

### Implementation Tracks

- Replace existing helpers in `lib/format.ts` with locale-aware utilities using `next-intl` formatters (`formatNumber`, `formatDate`, `formatList`), including fallback logic.
- Refactor duration formatter to support pluralization and localized abbreviations via ICU or tokens.
- Pass locale context through server actions and API handlers so formatted data matches client locale.
- Ensure accessibility strings and aria labels use translated messages and locale-aware values.

### Best Practices & Performance

- Cache formatter instances per locale to avoid repeated instantiation.
- Avoid shipping polyfills unless required; load conditionally for unsupported locales.
- Provide safe fallbacks for glyph-heavy strings (card suits) when fonts are missing, but keep preferred glyph in primary messages.

### Testing & QA

- Unit tests covering formatters across supported locales, including edge cases (large scores, zero values, durations over 24h).
- Regression tests for forms parsing localized input (if applicable) using Vitest or Playwright.
- Accessibility checks (Axe, screen reader smoke tests) for localized aria attributes.

### Validation Checklist

- [ ] Formatter utilities return correct output for each locale and fall back gracefully.
- [ ] Accessibility audit passes with localized labels.
- [ ] `npm run lint`
- [ ] `npm run format`
- [ ] `npm test`
- [ ] Performance profiling indicates no material bundle increase.

Exit gating: engineering sign-off that all locale-sensitive data paths are covered and consistent; perf budget review completed.

---

## Phase 4 - Routing, SEO, and Preference Persistence

### Objectives

- Deliver localized routing, metadata, and locale switching UX without regressing analytics or static export needs.
- Persist user locale choices across sessions and surfaces.

### Entry Criteria

- Phase 1 middleware and config in place; Phase 2 strings and Phase 3 formatters ready for all target locales.
- Decision recorded on static export vs hybrid rendering strategy.

### Implementation Tracks

- Configure Next.js locale segments (`/en`, `/es`, `/fr`, `/de`) with middleware rewrites for legacy URLs.
- Implement locale switcher UI in header or settings, persisting choice via cookie/local storage, keeping SSR and client behavior aligned.
- Localize metadata via `generateMetadata` per route, including Open Graph and structured data.
- Extend sitemap generation (`next-sitemap` or custom) to emit per-locale URLs and hreflang tags.
- Update analytics logging to include locale dimension and validate dashboards.

### Best Practices & Performance

- Follow existing navigation component patterns when introducing switchers to minimize churn.
- Keep locale switcher interactions accessible (ARIA roles) and keyboard friendly.
- Ensure static export strategy is compatible with locale segments; if required, document migration steps to hybrid hosting.

### Testing & QA

- Integration tests (Playwright/Cypress) covering locale switching, navigation, and persistence on refresh.
- Manual SEO validation (Lighthouse, Search Console) for localized metadata and hreflang correctness.
- Analytics smoke test verifying locale dimension populates as expected.

### Validation Checklist

- [ ] Locale switcher updates content and URL without full reload flash.
- [ ] Sitemaps, canonical tags, and hreflang entries validated in staging.
- [ ] Analytics dashboards confirm locale dimension ingestion.
- [ ] `npm run lint`
- [ ] `npm run format`
- [ ] `npm test`
- [ ] Stakeholder blessing from marketing/SEO and data analytics.

Exit gating: go-live approval for localized routing, ensuring SEO metrics monitored during rollout.

---

## Phase 5 - Translation Workflow, Quality Assurance, and Rollout

### Objectives

- Automate translation lifecycle with the chosen TMS and enforce quality gates.
- Launch locales incrementally with monitoring for translation completeness and UX fidelity.

### Entry Criteria

- Translation catalogs stable; TMS selection complete with glossary imported.
- Feature flag strategy defined for controlling locale availability.

### Implementation Tracks

- Integrate CI jobs to push/pull message catalogs with TMS (Crowdin, Phrase, etc.); ensure developer-friendly dry runs.
- Configure pseudo-localization build target to detect truncation and RTL issues early.
- Add runtime logging for missing translations and fallback usage; wire alerts.
- Implement rollout plan (feature flag toggling per locale, support playbook, release notes).
- Train QA and support teams on locale test plans and feedback channels.

### Best Practices & Performance

- Keep translation branches short-lived; enforce glossary validation in TMS before merge.
- Cache TMS API calls in CI where possible to avoid rate limits.
- Use feature flags to ramp locales gradually and rollback quickly if issues surface.

### Testing & QA

- End-to-end tests per locale on critical flows (game creation, scoring, archive management).
- Pseudo-locale regression passes without overflow or clipping.
- Real device smoke tests for highest traffic locales.

### Validation Checklist

- [ ] CI sync with TMS succeeds and is reproducible locally (documented command).
- [ ] Runtime missing-translation logs are clean in staging.
- [ ] Feature flag strategy documented and exercised for at least one pilot locale.
- [ ] `npm run lint`
- [ ] `npm run format`
- [ ] `npm test`
- [ ] Product/design sign-off on launch locales; support team briefed.

Exit gating: Pilot locale launched, telemetry monitored for stability, and no critical translation gaps reported.

---

## Phase 6 - Maintenance & Governance

### Objectives

- Ensure i18n remains reliable, performant, and easy to extend.
- Institutionalize processes for auditing translations, dependencies, and documentation.

### Entry Criteria

- Previous phases delivered localized experience in production.

### Implementation Tracks

- Update onboarding and contributing docs with i18n checklist (lint expectations, key naming, testing requirements).
- Automate quarterly audit script to detect unused keys, stale translations, and bundle size drift; surface results in dashboards.
- Monitor dependency updates (`next-intl`, ESLint rules) with scheduled upgrade tasks that include regression testing.
- Capture user feedback per locale, feed into backlog triage, and maintain response SLAs.

### Best Practices & Performance

- Keep message budgets per locale (track JSON size) to guard against bloat.
- Encourage incremental pseudo-localization runs before major releases.
- Align with existing engineering governance rituals (tech reviews, RFCs) to vet major i18n changes.

### Testing & QA

- Maintain CI guard for translation completeness and lint rules.
- Schedule smoke tests across locales tied to release cadence.
- Refresh accessibility audits at least annually or when launching new locales.

### Validation Checklist

- [ ] Onboarding docs updated with latest i18n expectations.
- [ ] Automated audit outputs reviewed and tracked.
- [ ] `npm run lint`
- [ ] `npm run format`
- [ ] `npm test`
- [ ] Leadership review of i18n health metrics each quarter.

Exit gating: Ongoing governance processes operational, ensuring new features respect i18n requirements without reintroducing hard-coded strings.

---

### Shared Validation Notes

- Record validation artifacts (screenshots, logs, audit reports) in the project wiki or `docs/i18n/` for future audits.
- When tests fail during phase validation, fix regressions before proceeding; never skip lint/format/test requirements.
- All new or refactored code introduced during these phases must ship with automated tests and, when relevant, documentation updates to keep the system maintainable.

This implementation guide is designed for incremental delivery with clear checkpoints, ensuring the El Dorado Score Keeper achieves a robust, sustainable internationalization posture.
