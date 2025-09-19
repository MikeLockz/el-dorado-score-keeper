# IMPLEMENTATION PLAN — PostHog Analytics

Phased plan derived from `POSTHOG_ANALYTICS.md`, sequenced with the ICE (Impact × Confidence ÷ Effort) assessment framework. Highest-impact, low-effort foundations land first so later instrumentation rides on a stable baseline. Each phase finishes with validation, `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`, and an atomic commit.

To keep the analytics stack swappable, the plan introduces an adapter layer (`AnalyticsAdapter`) that the UI and domain code depend on. A PostHog implementation ships initially, but any future provider only needs to plug into the adapter interface and register itself.

—

## Phase 0 — Baseline + Feature Gate + Adapter Skeleton (ICE: 8×0.9÷2 ≈ 3.6)

Scope

- Add `posthog-js` dependency and environment variable plumbing (`NEXT_PUBLIC_POSTHOG_*`, optional `POSTHOG_PERSONAL_API_KEY`).
- Create `lib/analytics/adapter.ts` exporting:
  - `AnalyticsAdapter` interface (`init`, `capture`, `identify`, `flush`, `optOut`, etc.).
  - `noopAnalyticsAdapter` and factory helpers.
- Introduce `config/flags.ts` (or extend existing config module) with `isAnalyticsEnabled()` that checks for `NEXT_PUBLIC_POSTHOG_KEY` and optional `ANALYTICS_ENABLED` feature flag.
- Document env keys in `README.md` (table-format) and surface a warning in dev tools when analytics disabled.

Validation

- `pnpm why posthog-js` succeeds.
- Default exported adapter resolves to noop when env key missing; feature flag returns false when key missing and true when supplied.
- Local dev logs a single warning (`console.info`) when analytics disabled; disappears once enabled.

Tests

- `tests/unit/config-flags.test.ts` ensuring `isAnalyticsEnabled()` respects env + flag precedence.
- `tests/unit/analytics-adapter.test.ts` verifying noop adapter methods are no-ops and factory falls back correctly.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "analytics: add adapter skeleton, feature gate, and env wiring"

—

## Phase 1 — Client Provider + PostHog Adapter (ICE: 7×0.9÷2 ≈ 3.15)

Scope

- Implement `posthogAnalyticsAdapter` in `lib/analytics/posthog-adapter.ts` using repo defaults (manual pageview capture, `$ip` blacklist, `app`/`env` registration).
- Create `app/analytics-provider.tsx` client component that:
  - Chooses between PostHog adapter and noop based on `isAnalyticsEnabled()`.
  - Exposes context and `useAnalytics()` hook returning adapter methods (no-ops when disabled).
  - Captures `$pageview` on pathname/search changes with debounce to avoid duplicates.
- Wrap `app/layout.tsx` children with `<AnalyticsProvider>` so call sites only rely on adapter contract.

Validation

- With env key defined, navigating between top-level pages sends exactly one `$pageview` (verified via PostHog debug or mocked capture in tests).
- When analytics disabled the provider short-circuits, adapter resolves to noop, and no errors thrown.

Tests

- `tests/unit/analytics-provider.test.tsx` using Vitest mocks to ensure PostHog adapter `init` called once and noop used when disabled.
- `tests/unit/use-analytics.test.ts` verifying context returns adapter methods and degrades gracefully when disabled.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "analytics: add provider over adapter and PostHog implementation"

—

## Phase 2 — Instrument Game Lifecycle Events via Adapter (ICE: 9×0.8÷3 ≈ 2.4)

Scope

- Centralize analytics helpers in `lib/analytics/events.ts` exposing typed wrappers (`trackGameStarted`, `trackPlayersAdded`, `trackRoundFinalized`) that consume the adapter context (not PostHog directly).
- Wire helpers into existing hooks/services (`useNewGameRequest`, `lib/state/players`, `lib/state/rounds`) after successful persistence so events fire once.
- Ensure payloads use UUIDs/counts only; derive enums from existing types. Register `env` property inside adapter initialization so helpers stay provider-agnostic.

Validation

- Manual flow creates events with expected schema (use PostHog Live feed or mock adapter).
- No double firing on retries—simulate rejection/resolve paths in tests.

Tests

- `tests/unit/analytics-events.test.ts` covering payload shape, guards against PII (property whitelist assertions) using a mock adapter.
- Extend existing hook tests (or create `tests/integration/analytics-game-flow.test.ts`) to mock adapter `capture` and assert calls when actions succeed and skip on failure.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "analytics: emit game lifecycle events through adapter"

—

## Phase 3 — Privacy Controls & DX (ICE: 6×0.85÷2 ≈ 2.55)

Scope

- Implement opt-out toggle in Settings using adapter `optOut()`/`optIn()` methods; persist preference in local storage and respect on provider init.
- Extend adapter with runtime assertions preventing captures when payloads include disallowed keys (`name`, `email`, etc.) during development; enforce via wrapper decorator around the active adapter.
- Update documentation: `POSTHOG_ANALYTICS.md` QA checklist, new section in `docs/ANALYTICS.md` linking to opt-out flow and assertions.

Validation

- Opt-out toggle stops subsequent events (verify via mocked adapter) and survives reloads.
- Dev-time assertions throw when disallowed keys detected; ensure they strip in production builds.

Tests

- `tests/ui/settings-analytics-optout.test.tsx` covering toggle behavior with mock adapter.
- `tests/unit/analytics-guard.test.ts` verifying disallowed keys trigger errors only in dev via decorator.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "analytics: enforce opt-out and payload guardrails via adapter"

—

## Phase 4 — Observability & Query Hand-off (ICE: 5×0.7÷2 ≈ 1.75)

Scope

- Ship dashboard automation scripts (e.g., `scripts/posthog/bootstrap-dashboards.ts`) using PostHog API when `POSTHOG_PERSONAL_API_KEY` available; create Trends, Funnel, and HogQL samples described in the guide.
- Add `docs/ANALYTICS.md` section with dashboard IDs/urls and instructions for re-running bootstrap script.
- Wire script into CI nightly or release checklist (documented in `CHANGELOG.md` or runbook) with instructions for manual execution when API key absent.

Validation

- Running script idempotently creates or updates dashboards (no duplicates).
- Documentation links resolve and match dashboards in PostHog.

Tests

- `tests/unit/bootstrap-dashboards.test.ts` mocking PostHog API client to ensure payload structure and idempotency logic.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "analytics: automate dashboard bootstrap and document hand-off"

—

## Phase 5 — Rollout & Monitoring (ICE: 4×0.8÷3 ≈ 1.07)

Scope

- Add feature flag rollout checklist to `docs/RELEASE.md` (or create) describing staged enablement (staging → production) and 24h monitoring window.
- Instrument lightweight health checks: expose adapter-backed counters in existing debug overlay via `lib/analytics/metrics.ts`.
- Capture adapter-level errors (`adapter.onError` or PostHog `on('error')`) and surface in Sentry (if available) or console with action items.

Validation

- Dry run release checklist in staging; confirm monitoring steps actionable.
- Trigger mock adapter failure and verify error handler reports correctly without user-facing crash.

Tests

- `tests/unit/analytics-error-handler.test.ts` ensuring handler routes errors to logging layer regardless of adapter implementation.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "analytics: add rollout guardrails and monitoring hooks"

—

## Completion

After Phase 5, run the full quality gates once more and update `CHANGELOG.md` summarizing analytics enablement. Coordinate with stakeholders to review dashboards and toggle the feature flag for production rollout. Future providers can implement `AnalyticsAdapter` and register in the provider without touching domain instrumentation.
