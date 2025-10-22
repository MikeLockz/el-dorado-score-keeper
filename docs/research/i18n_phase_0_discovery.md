# Phase 0 Internationalization Discovery

The audit covered high-visibility screens, core flows, and shared utilities in the El Dorado Score Keeper Next.js application. Findings capture the current localization posture, hotspots that will require refactoring, and open questions to resolve before implementation.

## Snapshot

- English-only copy throughout UI, metadata, and prompts; no message catalog or locale abstraction.
- Strings live directly in components (TSX) and utilities; a mix of headings, aria labels, tooltips, confirm dialogs, and status badges.
- Formatting helpers rely on `Intl` defaults with implicit locale, plus custom duration formatting that emits English abbreviations.
- Routing, metadata, analytics, and persistence layers do not track or persist locale preferences.
- Non-ASCII glyphs (ellipsis, non-breaking hyphen, suits) already ship, so message files must preserve Unicode safely.

## User-Facing Text Inventory (Selected Hotspots)

| Area / File                                                       | Observations                                                                                                                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root layout `app/layout.tsx`                                      | Metadata titles/descriptions hard-coded in English; `html lang="en"`; Open Graph locale fixed to `en_US`.                                                                                                |
| Primary navigation `components/header.tsx`                        | Menu labels, aria strings, logo alt text inline; menu uses `DropdownMenu` items with raw English copy.                                                                                                   |
| Landing experience `app/landing/page.tsx`, `components/landing/*` | Marketing copy, mode descriptions, CTA labels, aria labels, and status text inline. Includes U+2011 non-breaking hyphen and ellipsis for typographic polish.                                             |
| Scorecard views `components/views/CurrentGame.tsx` & children     | Round-state chips (`Locked`, `Active`, etc.), table headers, confirm-toasts, and helper functions generating labels (e.g., `R${round}`) embedded. Multiple English enums returned from helper functions. |
| Game archive `app/games/*.tsx`                                    | Table headers, button copy (`Restore`, `Delete`), dialog prompts via `window.confirm`, loading placeholders, status messages, and formatted analysis labels all hard-coded.                              |
| Player management `components/players/*`                          | Headings (`Players`), helper text, destructive confirmations; repeated phrases across components without reuse.                                                                                          |
| Settings `app/settings/page.tsx`                                  | Section titles, explanatory text, and button labels inline.                                                                                                                                              |
| Rules `app/rules/page.tsx`                                        | Long-form instructional copy in JSX paragraphs and lists; includes smart quotes and em dash characters.                                                                                                  |
| Debug & misc `app/debug/env/page.tsx`, `components/devtools`      | Developer-only pages still contain English strings; decide whether to exclude from translation scope.                                                                                                    |

Additional notes:

- Console warnings (`console.warn('Failed to load games')`) appear in English; decide if developer-facing only.
- Error boundary/UI fallback content needs cataloging once surfaced (search for `fallback=` props, `ErrorBoundary`).
- Several components build compound labels (e.g., `${stats.leaders.highestSingleBid.name} (R${round})`); will need ICU or formatter helpers.

## Locale-Sensitive Formatting & Data

- `lib/format.ts` uses `Date.prototype.toLocaleString`/`toLocaleTimeString` with `undefined` locale and fixed numeric options; currently follows browser locale but lacks explicit control or fallback.
- `formatDuration` emits compact English abbreviations (`1h 02m 03s`); no localization hooks or plural handling.
- Currency/number formatting is otherwise plain numbers (`{score}`) without grouping; ICU number formatting not in place.
- Trump suit helpers in single-player views return ASCII suit letters (A, K, Q, etc.) and card suits (`♠`, `♥`); ensure message catalogs support these glyphs and casing rules.
- Data persisted in IndexedDB/local storage does not store locale. Serverless APIs (`/api/log`) never receive locale context.

## Routing, SEO, and Analytics

- No Next.js i18n routing config; URLs are locale-agnostic. Static export (`output: 'export'`) must be revisited to ensure compatibility with localized routes.
- Locale detection absent; no cookie/localStorage preference for language or region.
- Sitemap/canonical infrastructure not wired for locales; `next-sitemap` not configured. Canonical tags, hreflang, and metadata will need locale variations.
- Analytics/logging (`lib/client-log.ts`) logs event name, path, UA only. Locale dimension must be added once available.

## Target Locale Decisions & Open Questions

- **Default locale**: Confirmed `en-US`.
- **Initial rollout locales**: Support Spanish, French, and German. Unless we hear otherwise, we will use `es-ES`, `fr-FR`, and `de-DE` to keep tags consistent and allow later expansion (e.g., `es-419`).
- **Locale scope**: Only user-facing surfaces—including dialogs—enter the translation workflow. Developer/debug routes, console logs, and analytics payloads stay English-only for now.

## Glossary Ownership & Copy Governance

- **Primary owner**: Product/design copy lead curates the canonical glossary, approves terminology updates, and coordinates with translators.
- **Game rules SME**: Tabletop rules subject-matter expert reviews translations for accuracy on mechanics-specific terms (`trump`, `bidding`, `round`, etc.).
- **Engineering partner**: Staff engineering owns key naming conventions, links glossary terms to message IDs, and blocks merges when glossary invariants break.
- **Workflow**: Maintain the glossary in the translation management system (TMS) with version history; updates require product sign-off and an announcement in the `#i18n` channel. Engineering syncs periodic snapshots into the repo (e.g., `locales/glossary.json`) for offline validation and tests.
- **Long-form content**: Rulebook and help content follow the same approval path with professional translation whenever copy changes.

## Typography Guidelines

- Preserve existing typographic glyphs (non-breaking hyphen, ellipsis, suit symbols) in source strings; include translator notes to keep semantic variants in localized messages.
- Provide ASCII fallbacks only for clients that cannot render the glyph; engineering supplies formatter utilities to downgrade gracefully when needed.
- Document glyph expectations in translator briefs and the PR template to avoid regressions when updating copy.

## Risks & Considerations

- High volume of inline strings increases initial extraction effort; introduce linting early to prevent regressions.
- Confirm dialogs (`window.confirm`) require replacement with custom modal to support translations and rich text.
- Static export + dynamic locale routing may conflict; may need to shift to hybrid rendering or configure per-locale exports.
- Performance: loading entire translation JSON for analytics-heavy pages could affect initial bundle; plan for route-level message bundles.
- Tests snapshot UI text in English; adjust expectations and leverage locale-agnostic assertions.

## Recommended Next Steps

1. **Stakeholder sign-off** on target locales, exclusion list, and rollout order.
2. **Establish glossary & key conventions** with product/design, focusing on game-specific terminology (e.g., `trump`, `bidding`, `round`).
3. **Define technical constraints** for static export vs. localized routing; evaluate need to switch away from `output: 'export'` for SSR locale detection.
4. **Prep tooling**: choose translation management system, draft lint rules (`no-literal-string`), and pseudo-localization strategy ahead of extraction.
5. **Schedule copy freeze** window for Phase 2 to minimize churn while strings move into catalogs.

Document owners: engineering for implementation details; product/design for locale prioritization and glossary; QA for expanded test matrix.
