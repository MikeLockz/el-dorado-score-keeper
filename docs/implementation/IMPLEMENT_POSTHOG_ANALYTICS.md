# IMPLEMENTATION PLAN — PostHog Analytics

Plan aligned with `POSTHOG_ANALYTICS.md`. The work rides on the existing browser telemetry adapter (`BrowserTelemetryProvider`) so analytics and observability share the same feature gates and helper APIs. Each phase should end with validation, `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`, and an atomic commit.

---

## Status Check

- Feature flag + config: ✅ `NEXT_PUBLIC_OBSERVABILITY_ENABLED` gates all browser telemetry, and `config/observability.ts` already parses PostHog keys/host/debug while defaulting to New Relic.
- Vendor registry: ⚠️ PostHog entry currently resolves to `createNoopBrowserAdapter()`; no SDK is loaded yet.
- Instrumentation: ⚠️ Domain events still route through `client-log` but only New Relic receives them.

Phase 1 picks up from this baseline.

---

## Phase 1 — PostHog Browser Adapter (ICE: 7×0.9÷2 ≈ 3.15)

Scope

- Add `posthog-js` to app dependencies.
- Implement PostHog adapter under `lib/observability/vendors/posthog/browser-adapter.ts` (as outlined in `POSTHOG_ANALYTICS.md`):
  - Guard against SSR, initialise once, disable autocapture/session recording, register `app` + `env`, and denylist `$ip`.
  - Map `page.viewed` → `$pageview`, forward other events verbatim, and wrap `recordException`.
  - Expose `getSessionUrl()` via `posthog.get_session_replay_url?.()` when available.
- Add a barrel (`lib/observability/vendors/posthog/index.ts`) to keep the `@obs/browser-vendor/*` alias consistent.
- Update `lib/observability/vendors/registry.ts` to import the new adapter instead of returning a noop.
- Extend test doubles:
  - `tests/unit/browser-telemetry.guard.test.ts` should stub `@obs/browser-vendor/posthog`.
  - New adapter unit tests asserting event mapping, sanitisation, and that `sanitizeAttributes` is respected (mock PostHog client).
- Document the dependency in `README.md` (analytics section) if not already listed.

Validation

- With `NEXT_PUBLIC_OBSERVABILITY_ENABLED=true`, `NEXT_PUBLIC_OBSERVABILITY_PROVIDER=posthog`, and a valid key, navigating between pages sends a single `$pageview` per route (confirmed via PostHog live feed or mocked capture).
- Disabling the feature flag or removing the key prevents `posthog-js` from being bundled (inspect the production build stats).
- Error boundaries continue to call `captureBrowserException` without runtime errors when PostHog is disabled.

Tests

- `tests/unit/posthog-adapter.test.ts` (new) verifying:
  - `page.viewed` maps to `$pageview`.
  - Attributes are passed through `sanitizeAttributes` (no functions/undefined).
  - `recordException` captures `browser.exception` with derived message.
- Update `tests/unit/browser-telemetry.guard.test.ts` (or add a new suite) to confirm that selecting the PostHog provider loads the adapter once and falls back to noop when keys missing.
- Ensure Vitest snapshots/mocks cover the new alias (`vi.mock('@obs/browser-vendor/posthog', …)`).

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: `feat(analytics): add PostHog browser adapter`

---

## Phase 2 — Instrument Game Lifecycle Events (ICE: 9×0.8÷3 ≈ 2.4)

Scope

- Define typed helpers in `lib/observability/events.ts` (or similar) wrapping `trackBrowserEvent` for:
  - `trackGameStarted`
  - `trackPlayersAdded`
  - `trackRoundFinalized`
- Wire helpers into:
  - `lib/game-flow/new-game.ts` after the archive/reset succeeds to emit `game.started`.
  - `lib/state/players` (player add/import flows) to emit `players.added` with aggregate counts.
  - `lib/state/rounds` after a round persists to emit `round.finalized` with duration + variant metadata.
- Normalise event names to dot-case (`game.started`) and migrate existing `client-log.logEvent` usages where applicable so New Relic/PostHog receive consistent signals.
- Guarantee payloads use UUIDs/counts/enums only; forbid free-form player input.

Validation

- Manual walkthrough with PostHog key enabled shows the three core events with expected properties.
- Retrying failed flows does not double-fire events (add guards after persistence resolves).

Tests

- `tests/unit/analytics-events.test.ts` (new) mocking `trackBrowserEvent` to assert payload shapes and property allowlists.
- Extend existing hook/state tests to assert events fire on success and are skipped on error/cancel paths.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: `feat(analytics): emit game lifecycle events`

---

## Phase 3 — Privacy Controls & Opt-out (ICE: 6×0.85÷2 ≈ 2.55)

Scope

- Create `lib/observability/privacy.ts` with a small preference store:
  - `getAnalyticsPreference`, `setAnalyticsPreference`, `subscribeToAnalyticsPreference` (pub/sub used by React + telemetry layer).
  - Persist to `localStorage` under `el-dorado:analytics:opt-out` with graceful fallback for private browsing.
  - Defer PostHog-specific behaviour to `syncOptOut` exported from `lib/observability/vendors/posthog`, and guard against SSR.
- Update `lib/observability/browser.ts` to honour the preference:
  - Bail out early (`noopTelemetry`) when the stored preference is `disabled`.
  - Wrap `track`, `captureException`, and `captureMessage` so they cancel when opted out.
  - Subscribe to preference changes; opt-out wipes the active telemetry, opt-in re-runs `ensureBrowserTelemetry()`.
- Extend the PostHog vendor barrel with `export const syncOptOut = (preference: 'enabled' | 'disabled') => { ... }` invoking `posthog.opt_out_capturing()` / `opt_in_capturing()`.
- Add a Settings toggle:
  - Create `components/settings/analytics-opt-out.tsx` (client component) that uses `useSyncExternalStore` over the preference store and renders an accessible checkbox control.
  - Update `app/settings/page.tsx` to include the new section below Theme, referencing the component and shipping copy that clarifies persistence + privacy scope.
  - Style via the existing `page.module.scss`; add new classes if needed.
- Introduce a development-only payload guard (`lib/observability/payload-guard.ts`) that throws when telemetry attributes include denied keys or long free-form strings. Call the guard from `trackBrowserEvent` when `process.env.NODE_ENV !== 'production'`.
- Refresh documentation (`POSTHOG_ANALYTICS.md`, `docs/ANALYTICS.md`) describing the toggle, persistence behaviour, and payload validation.

Validation

- With preference disabled, navigate the app and confirm PostHog receives no `$pageview` or custom events; refresh to verify persistence.
- Re-enable analytics without reloading and ensure the next navigation captures exactly one `$pageview`.
- In development, intentionally emit a banned payload (`trackBrowserEvent('test', { name: 'Ada' })`) and confirm the guard throws with a descriptive error (silenced in production builds).
- Confirm `docs/ANALYTICS.md` now documents the opt-out toggle and support expectations.

Tests

- `tests/unit/observability-privacy.test.ts` covering preference persistence, subscription fan-out, and PostHog `syncOptOut` integration.
- `tests/ui/settings-analytics-optout.test.tsx` to confirm the new toggle renders, flips state across rerenders, and calls `setAnalyticsPreference`.
- `tests/unit/analytics-payload-guard.test.ts` ensuring the guard blocks denied keys in development but no-ops in production.
- Extend `tests/ui/browser-telemetry-provider.test.tsx` (or add a new suite) to assert telemetry stops when preference is disabled and resumes on opt-in.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: `feat(analytics): add opt-out toggle and payload guardrails`

---

## Phase 4 — Dashboards & Automation (ICE: 5×0.7÷2 ≈ 1.75)

Scope

- Introduce a PostHog automation workspace:
  - Add `scripts/posthog/bootstrap-dashboards.ts` and (if helpful) a sibling `client.ts` that wraps authenticated `fetch` calls.
  - Read `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, and optional `POSTHOG_API_HOST` from the environment. Fail fast with descriptive errors when configuration is missing.
- Implement an idempotent upsert pipeline:
  - `getInsightByName` issues `GET /api/projects/:id/insights/?search=<name>&limit=1` and returns the first match.
  - `createInsight` performs `POST /api/projects/:id/insights/`; `updateInsight` performs `PATCH /api/projects/:id/insights/:uuid/`.
  - Normalise payloads so each definition is a frozen data object (name, description, tags, filters, `query`).
- Encode dashboard definitions for the three key artefacts:
  - Trends insight (`game.started` breakdown by `mode` with weekly interval).
  - Funnel insight (`$pageview` → `players.added` → `round.finalized`, ordered, 30-minute window).
  - HogQL insight encapsulating the query from §7.3 of the guide.
- Add CLI ergonomics:
  - Support `--dry-run` (log payloads, skip writes) and `--json` (machine-readable summary for CI).
  - Register `posthog:bootstrap` in `package.json` using `tsx`.
- Documentation & release hygiene:
  - Record resulting insight IDs + URLs in `docs/ANALYTICS.md`.
  - Extend the release checklist to include `pnpm posthog:bootstrap` after telemetry schema changes.

Implementation outline

- Script skeleton
  - Create `scripts/posthog/types.ts` (optional) with shared `InsightDefinition`, `CliConfig`, and discriminated unions for `TrendsQuery`, `FunnelsQuery`, and `HogQLQuery` to keep payloads type-safe.
  - In `bootstrap-dashboards.ts`, call `loadConfig()` at the top (`try/catch` to print human-friendly errors before exiting with status `1`).
  - Parse CLI flags using a lightweight helper (`const flags = new Set(process.argv.slice(2))`). Derive `dryRun`/`json` booleans once and pass down.
- HTTP client helpers
  - Build `request(config, path, init)` around the global `fetch` (Node 18). Inject headers (`Authorization: Bearer <key>`, JSON content type) and surface non-2xx responses by throwing errors containing the status code, path, and body snippet.
  - Wrap `request` with typed helpers: `getInsightByName(config, name)`, `createInsight(config, definition)`, `updateInsight(config, current, definition)`.
- Upsert engine
  - Freeze and export an array of definitions in `scripts/posthog/insights.ts`; each object contains `name`, `description`, `tags`, `kind`, `filters`, and `query` (mirroring the guide’s payload examples).
  - In the entry point, iterate sequentially to keep console output deterministic. For each definition: fetch existing insight, compute the HTTP verb (`POST` vs `PATCH`), and log `{ name, action: 'created' | 'updated', id }`.
  - Respect `--dry-run` by short-circuiting before mutating endpoints; still print the diffed payload via `console.dir` or `JSON.stringify`.
  - Respect `--json` by collecting the summary rows in an array and printing `JSON.stringify({ results, dryRun }, null, 2)` at the end instead of the tabular log.
- Error handling
  - On thrown errors, set `process.exitCode = 1` after logging the message (avoid `process.exit()` to keep Vitest friendly).
  - Terminate early if required env vars missing or `projectId` fails to parse.

Validation

- Execute `pnpm posthog:bootstrap --dry-run` locally; confirm payloads include the expected filters and the script exits with status 0.
- Run the script against a staging project twice; first run should log `created`, second `updated` with identical IDs.
- Manually verify the dashboards in PostHog render with the intended breakdowns, step order, and HogQL query output.
- Redact the printed URLs before sharing logs to avoid leaking project IDs.

Tests

- `tests/unit/posthog-bootstrap.test.ts` mocking the REST client to cover:
  - configuration validation and error paths.
  - create vs update branching based on `getInsightByName` results.
  - payload snapshots for trends/funnel/HogQL definitions.
- Optional integration smoke test behind a `POSTHOG_E2E_BASE_URL` guard if CI credentials are ever supplied.
- Consider a second unit suite (`tests/unit/posthog-bootstrap-flags.test.ts`) to confirm `--dry-run` prevents write calls and `--json` outputs a machine-readable payload.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: `chore(analytics): bootstrap PostHog dashboards`

---

## Phase 5 — Rollout & Monitoring (ICE: 4×0.8÷3 ≈ 1.07)

Scope

- Publish a staged enablement checklist in `docs/RELEASE.md` covering staging enablement, production cut-over, and rollback steps (toggle back to `newrelic`/disable observability, rotate PostHog keys).
- Link the checklist to dashboard URLs, the PostHog project, and alerting channels so on-call engineers can ramp up fast.
- Capture the same content in a dedicated runbook (`docs/runbooks/analytics.md`) with verification steps, key rotation guidance, and escalation contacts. Reference the quarterly audit reminder for dashboard hygiene.
- Harden adapter error handling: ensure `ensureBrowserTelemetry()` wraps vendor bootstrapping in `try/catch`, pipes failures through `captureBrowserMessage`/`captureBrowserException`, and exposes a lightweight `getDiagnostics()` surface (`provider`, `bootstrapped`, `lastError`).
- Extend the developer debug overlay (new `components/debug/analytics-panel.tsx` or similar) to subscribe to telemetry events, render the last ~10 events + aggregate counters, and flag when analytics are disabled. Gate behind `NODE_ENV !== 'production'` and a keyboard shortcut (`Shift+Alt+A`).
- Emit a single debug log when analytics are disabled via the Phase 3 preference toggle to differentiate opt-outs from errors (only when `NEXT_PUBLIC_POSTHOG_DEBUG` is truthy).
- Add a dual-provider path by wiring `lib/observability/vendors/custom.ts` to fan out to both PostHog and New Relic, and document `NEXT_PUBLIC_OBSERVABILITY_PROVIDER=custom` as the flag teams should use when they want parallel analytics.

Validation

- Execute the new rollout checklist in staging end-to-end; revise documentation if any step causes friction.
- Toggle between `newrelic` and `posthog` providers within one session to ensure telemetry swaps without double-initialisation.
- Simulate adapter failures (invalid key, network block) and confirm warnings surface through `captureBrowserMessage` and the debug overlay while gameplay continues.
- Validate the debug overlay: shows recent events/counters in development, hides in production, and reflects opt-out state in real time.
- Record initial 24-hour production monitoring notes in the runbook once enabled.

Tests

- `tests/unit/analytics-error-handler.test.ts` (new) ensuring adapter failures invoke the logging layer and preserve noop telemetry fallback.
- Component test (Playwright/Vitest) covering the debug overlay toggle, event rendering, and opt-out warning (skipped in production builds).
- Update existing telemetry mocks to include `getDiagnostics()` so the overlay can be exercised in isolation.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: `chore(analytics): document rollout & add monitoring hooks`

---

## Completion

After Phase 5, rerun the full quality gates and update `CHANGELOG.md` with the analytics rollout summary. Coordinate with stakeholders to enable the PostHog provider in production, confirm dashboards, and monitor the first 24 hours for volume & privacy compliance.
