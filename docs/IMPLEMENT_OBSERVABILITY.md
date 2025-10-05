# IMPLEMENTATION PLAN - Observability

Phased plan derived from `OBSERVABILITY.md`, prioritized with ICE (Impact x Confidence / Effort). We land guardrails first, then roll out server, client, and worker telemetry before investing in hygiene and dashboards. Each phase ends with validation, `pnpm format:write && pnpm lint && pnpm test && pnpm typecheck`, and an atomic commit.

---

## Baseline Guardrails

- HyperDX must remain opt-in; instrumentation no-ops when credentials or the feature flag are missing.
- Follow the config patterns introduced for analytics so env parsing and defaults live in `config/` rather than scattered across modules.
- Keep observability helpers side-effect free by default so Vitest, Storybook, and production builds stay deterministic.
- Prefer structured logging via a shared adapter instead of ad-hoc `console.*`; fall back to a noop logger in tests.
- Update `README.md` and relevant docs whenever new environment variables, smoke scripts, or runbooks are introduced.

---

## Status Check

- Phase 0 — Dependencies, Env Contracts, Feature Flag: ✅ Complete in repo (env plumbing, smoke script, config helpers). Server-side HyperDX packages were removed; only the browser SDK remains.
- Phase 1 — Next.js Instrumentation Bootstrap: ✅ Complete (root `instrumentation.ts`, structured logger, docs/tests in place).
- Phase 2 — Domain Spans and Server Coverage: ✅ Complete. Span helpers live in `lib/observability/spans.ts`, domain flows in `lib/state/io.ts` and `lib/state/logic.ts` emit spans, and coverage lives in `tests/unit/observability-spans.test.ts` plus `tests/unit/observability-domain-flows.test.ts`.
- Phase 3 — Browser SDK Integration: ✅ Complete in this branch. `HyperDXProvider`, `lib/observability/browser.ts`, client log refactors, and the supporting tests/docs landed with this phase.

> **Update:** The app now runs as a fully static/client-side experience. Phases describing Node/Edge instrumentation remain below for historical context but are no longer part of the active scope. Only the browser telemetry items are considered current.

## Phase 0 - Dependencies, Env Contracts, Feature Flag (ICE: 9x0.9/2 ~ 4.05)

Scope

- Add pinned dependency: `@hyperdx/browser` plus optional dev dependency `@hyperdx/cli` for tunnel smoke tests. Server/worker packages are no longer required.
- Introduce `config/observability.ts` exporting `getHyperDXConfig()` plus `isObservabilityEnabled(runtime)` helpers that validate env vars with `zod`, derive defaults (service name, env), and expose a typed config object.
- Add `OBSERVABILITY_ENABLED` (server) and `NEXT_PUBLIC_OBSERVABILITY_ENABLED` (client) feature flags, defaulting to off, and surface them from `config/flags.ts` (create the module if absent).
- Extend `.env.example`, `.env.local.example`, and `cloudflare/analytics-worker/.dev.vars.example` with placeholder keys described in `OBSERVABILITY.md`; annotate secrets-only variables.
- Document install and smoke instructions in `README.md` (infra section) and add `pnpm observability:smoke` that wraps `pnpm exec hyperdx tunnel --service app` with helpful output.

Validation

- `pnpm why @hyperdx/browser` resolves the dependency with the expected pinned version.
- `isObservabilityEnabled('browser')` returns `false` by default and `true` when the corresponding flag plus env key are set.
- `pnpm observability:smoke` exits early with a friendly message when credentials are absent and forwards traffic when present.

Tests

- `tests/unit/observability-config.test.ts` covering config parsing, defaults, and flag precedence.
- `tests/unit/observability-env-guards.test.ts` guaranteeing missing browser keys throw descriptive errors inside `getHyperDXConfig`.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm test && pnpm typecheck`
- Commit: `chore(obs): add hyperdx deps, env plumbing, and feature gate`

---

## Phase 1 - Next.js Instrumentation Bootstrap (ICE: 8x0.85/2 ~ 3.40)

Scope

- Create `instrumentation.ts` at the repo root following the pattern in `OBSERVABILITY.md`: register HyperDX only when the server config is enabled, configure diag logging for non-production, and attach resource attributes (service.version, deployment.region).
- (Deprecated) Server-side logger helpers were removed when the app became browser-only.
- Update `package.json` scripts with `prestart` that executes `node --import tsx instrumentation.ts` so production builds verify registration before boot.
- Replace `console.*` usage in server code (for example `app/api/log/route.ts`, `lib/state/io.ts`, `lib/state/events.ts`) with the new structured logger; ensure log metadata keeps PII out by default.
- Document startup expectations (log messages, guardrails) in `docs/observability/next.md` or similar.

Validation

- `pnpm build && pnpm start` with HyperDX credentials emits a single "HyperDX OTel registered" log and begins exporting traces; without credentials the app boots cleanly with a short info log.
- Running `pnpm test` continues to operate without global side effects because the noop logger is used.
- `rg "console\\." app lib` returns no server-side occurrences (client-side handled in Phase 3).

Tests

- `tests/unit/observability-instrumentation.test.ts` that stubs env vars and verifies `registerNodeTelemetry` calls `registerOTel` with the expected payload and short-circuits otherwise.
- `tests/unit/logger-adapter.test.ts` ensuring the logger sends severity, service, and resource metadata while behaving as a noop when disabled.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm test && pnpm typecheck`
- Commit: `feat(obs): bootstrap node instrumentation and structured logging`

---

## Phase 2 - Domain Spans and Server Coverage (ICE: 8x0.8/2.5 ~ 2.56)

Scope

- Introduce `lib/observability/spans.ts` with helpers like `withSpan(name, attributes, fn)` and `recordError(span, error)` built on `@opentelemetry/api` tracers.
- Instrument high-signal flows:
  - Game lifecycle in `lib/state/logic.ts` and `lib/state/io.ts` (game creation, round finalize, score persistence).
- ~~API handlers under `app/api/**` to capture request/response metadata and error status.~~ _(Not applicable: client-only app—no new server handlers to instrument.)_
  - Background scripts in `scripts/` that touch persistence or external services.
- Emit structured events to the logger when spans finish with error status for faster correlation.
- Ensure instrumentation is lightweight: reuse tracers, avoid capturing large payloads, and guard spans behind `isObservabilityEnabled('server')`.

Validation

- Local end-to-end flow (create game, play rounds) surfaces spans named after the helper wrappers with attributes for player count, deck variant, and duration.
- Error paths (forced failure in `lib/state/io.ts`) produce error spans and structured logs without throwing unhandled exceptions.
- Bundle analysis shows negligible increase in server bundle size compared to the Phase 1 baseline.

Tests

- `tests/unit/observability-spans.test.ts` verifying `withSpan` starts and stops spans, records attributes, and never executes when disabled.
- Extend existing state tests (or add `tests/integration/state-observability.test.ts`) to mock the tracer and ensure spans plus logs fire on success and failure cases.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm test && pnpm typecheck`
- Commit: `feat(obs): add span helpers and instrument server game flows`

---

## Phase 3 - Browser SDK Integration (ICE: 7x0.8/2 ~ 2.80)

Scope

- [x] Add `app/hyperdx-provider.tsx` matching the sample provider: lazy-init HyperDX in `useEffect`, respect `NEXT_PUBLIC_OBSERVABILITY_ENABLED`, wire pageview tracking, and expose `captureBrowserException` / `captureBrowserMessage` helpers.
- [x] Wrap `app/layout.tsx` children in `<HyperDXProvider>` and pass through existing providers without altering HTML semantics.
- [x] Refactor client components previously using `console.error`/`console.warn` (search in `app/**` and `components/**`) to call the shared browser telemetry helpers.
- [x] Provide `lib/observability/browser.ts` that exports guards, telemetry facades, and noop fallbacks for SSR/tests.
- [x] Document browser opt-out instructions alongside PostHog analytics guidance so support has a single reference.

Validation

- With browser keys present, navigating between top-level routes generates `page.viewed` events exactly once per route change.
- When disabled (no key or flag), components render without initializing the SDK; bundle analysis shows the provider adds less than 15 KB gzipped.
- Running Storybook or jsdom tests does not access `window` before it is defined.

Tests

- [x] `tests/ui/hyperdx-provider.test.tsx` (jsdom) asserting init runs only when enabled and that navigation triggers a single track call.
- [x] `tests/unit/browser-telemetry.guard.test.ts` ensuring helper functions return noop implementations in SSR contexts.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm test && pnpm typecheck`
- Commit: `feat(obs): wire browser provider and client error capture`

---

## Phase 4 - Cloudflare Worker Telemetry (ICE: 6x0.85/2 ~ 2.55)

Scope

- Add `@hyperdx/otel-worker` to the Cloudflare workspace and create `cloudflare/analytics-worker/src/telemetry.ts` that initializes worker telemetry using env-driven config.
- Wrap the worker `fetch` handler with `telemetry.trace` and `wrapFetch` per the guide, capturing route, response status, retries, and outbound Slack latency.
- Introduce secrets management docs under `cloudflare/analytics-worker/README.md` outlining `wrangler secret put` commands and local `.dev.vars` expectations.
- Add `pnpm observability:worker` script that runs `wrangler dev` plus `pnpm exec hyperdx tunnel --service analytics-relay` to simplify local validation.

Validation

- `wrangler dev` with mock credentials emits spans grouped under `analytics-relay`; errors from upstream APIs include stack traces and attributes.
- Worker deployment without credentials still runs with telemetry disabled (no thrown errors).
- The smoke script prints actionable instructions when dependencies or credentials are missing.

Tests

- `cloudflare/analytics-worker/tests/telemetry.test.ts` using Miniflare or mocked context to confirm spans and logs are emitted and disabled when flags are off.
- `tests/unit/worker-config.test.ts` validating worker config parsing and defaults.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm test && pnpm typecheck`
- Commit: `feat(obs): instrument analytics worker with hyperdx`

---

## Phase 5 - Data Hygiene, Sampling, and ESLint Guardrails (ICE: 6x0.9/2.5 ~ 2.16)

Scope

- Implement `lib/observability/sanitizer.ts` that redacts PII (names, emails, free-form text) from log payloads and span attributes; apply it inside logger and span helpers.
- Configure sampling defaults (100 percent initially) via `getHyperDXConfig`, expose overrides for environments, and document how to tune them.
- Add client-side attribute allowlists to the provider to exclude cookies or local storage values.
- Extend ESLint config (`eslint.config.mjs`) with a rule (for example `no-console` for server files) that enforces usage of the structured logger and allows explicit overrides where necessary.
- Update docs (`OBSERVABILITY.md` addendum or new `docs/observability/hygiene.md`) with privacy guidelines and the sampling playbook.

Validation

- Running end-to-end flows confirms sensitive strings (player names) are redacted in logs and spans.
- ESLint fails on new `console.*` usage in server directories while still permitting client-specific consoles when annotated.
- Adjusting sampling via env vars immediately changes exported span volume (observable in HyperDX Live view).

Tests

- `tests/unit/observability-sanitizer.test.ts` verifying redaction and attribute allowlist behavior.
- `tests/unit/logger-sampling.test.ts` asserting sampling config respects per-environment overrides and falls back to defaults.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm test && pnpm typecheck`
- Commit: `chore(obs): enforce hygiene, sampling, and lint guardrails`

---

## Phase 6 - Dashboards, Alerts, and Runbooks (ICE: 5x0.8/2 ~ 2.00)

Scope

- Create `scripts/observability/bootstrap.ts` that calls the HyperDX API (via `@hyperdx/cli` or REST) to set up the dashboards and alerts described in the source doc; make it idempotent for reruns.
- Add documentation in `docs/observability/dashboards.md` listing dashboard IDs, alert thresholds, and links to runbooks; include troubleshooting steps.
- Update CI or the release checklist (`docs/release-checklist.md`) to include running the bootstrap script when credentials are available.
- Provide runbook templates (Markdown) that align alert names with triage steps and HyperDX queries.

Validation

- Running the bootstrap script against a sandbox workspace creates or updates the three dashboards, three alerts, and links runbooks without duplication.
- Documentation links resolve correctly (checked manually) and the checklist captures responsibilities.
- CI or manual pipeline logs confirm the script exits zero when credentials are missing (skips with warning) and when present (executes).

Tests

- `tests/unit/bootstrap-observability.test.ts` mocking HyperDX API calls to ensure idempotent payloads and alert thresholds.
- `tests/unit/runbook-link.test.ts` verifying docs reference valid Markdown files (for example using file existence assertions).

Run & Commit

- `pnpm format:write && pnpm lint && pnpm test && pnpm typecheck`
- Commit: `chore(obs): bootstrap dashboards, alerts, and runbooks`

---

## Phase 7 - Rollout, Monitoring, and Post-Launch QA (ICE: 4x0.85/2 ~ 1.70)

Scope

- Extend the rollout checklist (`docs/observability/rollout.md`) covering staging enablement, preview verification, production cutover, and rollback levers.
- Add monitoring hooks to existing debug tooling (for example `app/debug` route) that surface last-exported span timestamp, active sampling rate, and worker health.
- Wire HyperDX error callbacks to the existing incident response channel (for example send structured log via `lib/client-log.ts` or PostHog) to catch exporter failures quickly.
- Update `CHANGELOG.md` once telemetry is live and call out manual follow-ups (PII audits, sampling adjustments, dashboard reviews).

Validation

- Dry run the rollout doc in a sandbox environment; record findings and update documentation with real metrics.
- Trigger a simulated exporter failure and confirm the incident channel surfaces actionable information without breaking the user experience.
- Post-launch, review HyperDX dashboards to ensure data completeness before closing the rollout checklist.

Tests

- `tests/unit/observability-healthpanel.test.tsx` ensuring the debug UI renders telemetry health info and handles missing data gracefully.
- `tests/unit/exporter-error-handler.test.ts` verifying the error handler routes failures to the incident logger without throwing.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm test && pnpm typecheck`
- Commit: `chore(obs): finalize rollout playbook and monitoring hooks`

---

## Completion

After Phase 7, rerun the full quality gate (`pnpm format:write && pnpm lint && pnpm test && pnpm typecheck && pnpm build`) and update `CHANGELOG.md` with a summary of the observability launch. Schedule a joint review with engineering and operations to confirm dashboards alert as intended, then remove feature flag defaults once HyperDX is stable in production.
