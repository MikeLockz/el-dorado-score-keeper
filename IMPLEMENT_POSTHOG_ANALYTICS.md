# IMPLEMENTATION PLAN — PostHog Analytics

Phased plan derived from `POSTHOG_ANALYTICS.md`, sequenced with the ICE (Impact × Confidence ÷ Effort) assessment framework. Highest-impact, low-effort foundations land first so later instrumentation rides on a stable baseline. Each phase finishes with validation, `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`, and an atomic commit.

—

## Phase 0 — Baseline + Feature Gate (ICE: 8×0.9÷2 ≈ 3.6)

Scope

- Add `posthog-js` dependency and environment variable plumbing (`NEXT_PUBLIC_POSTHOG_*`, optional `POSTHOG_PERSONAL_API_KEY`).
- Introduce `config/flags.ts` (or extend existing config module) with `isAnalyticsEnabled()` that checks for `NEXT_PUBLIC_POSTHOG_KEY` and an optional `ANALYTICS_ENABLED` feature flag.
- Document the env keys in `README.md` (table format matching existing conventions) and surface a warning in dev tools when analytics is disabled.

Validation

- `pnpm why posthog-js` succeeds; Feature flag returns false when key missing and true when supplied.
- Local dev logs a single warning (`console.info`) when analytics disabled; disappears once enabled.

Tests

- `tests/unit/config-flags.test.ts` ensuring `isAnalyticsEnabled()` respects env + flag precedence.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "analytics: add posthog baseline wiring and feature gate"

—

## Phase 1 — Client Provider + Page Views (ICE: 7×0.9÷2 ≈ 3.15)

Scope

- Create `app/posthog-provider.tsx` client component that initializes PostHog with repo defaults (manual pageview capture, `$ip` blacklist, `app`/`env` registration).
- Wrap `app/layout.tsx` children with `<PostHogProvider>` behind `isAnalyticsEnabled()` guard to avoid bundling PostHog when off.
- Add `useAnalytics()` hook exporting `capture`/`identify` no-ops when disabled; ensures maintainable call sites.
- Capture `$pageview` on pathname/search changes with debounce to avoid duplicate captures on rapid transitions.

Validation

- With env key defined, navigating between top-level pages sends exactly one `$pageview` (verified via PostHog debug or mocked capture in tests).
- When analytics disabled the provider short-circuits, bundles shrink (size-limit snapshot optional) and no errors thrown.

Tests

- `tests/unit/posthog-provider.test.tsx` using Jest/Vitest mocks to ensure init called once and `$pageview` fired on route change.
- `tests/unit/use-analytics.test.ts` verifying no-op behavior when disabled.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "analytics: add PostHog provider and pageview tracking"

—

## Phase 2 — Instrument Game Lifecycle Events (ICE: 9×0.8÷3 ≈ 2.4)

Scope

- Centralize analytics helpers in `lib/analytics/events.ts` exposing typed wrappers: `trackGameStarted`, `trackPlayersAdded`, `trackRoundFinalized`.
- Wire helpers into existing hooks/services (`useNewGameRequest`, `lib/state/players`, `lib/state/rounds`) after successful persistence so events fire once.
- Ensure payloads use UUIDs/counts only; derive enums from existing types. Register an `env` property once in provider to avoid duplication.

Validation

- Manual flow creates events with expected schema (use PostHog Live feed or mock).
- No double firing on retries—simulate rejection/resolve paths in tests.

Tests

- `tests/unit/analytics-events.test.ts` covering payload shape, guards against PII (e.g., property whitelist assertions).
- Extend existing hook tests (or create `tests/integration/analytics-game-flow.test.ts`) to mock `posthog.capture` and assert calls when actions succeed and skip on failure.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "analytics: emit game lifecycle events via typed helpers"

—

## Phase 3 — Privacy Controls & DX (ICE: 6×0.85÷2 ≈ 2.55)

Scope

- Add `posthog.opt_out_capturing()` integration: expose a user-facing toggle in Settings (reusing existing UI patterns under `app/settings`). Persist preference in local storage and respect on provider init.
- Extend provider with runtime assertions preventing captures when payloads include disallowed keys (`name`, `email`, etc.) during development.
- Update documentation: `POSTHOG_ANALYTICS.md` QA checklist, new section in `docs/ANALYTICS.md` linking to opt-out flow and assertions.

Validation

- Opt-out toggle stops subsequent events (verify via mocked capture and PostHog debug) and survives page reloads.
- Dev-time assertions throw when disallowed keys detected; ensure they strip in production builds.

Tests

- `tests/ui/settings-analytics-optout.test.tsx` or extend existing settings tests to cover toggle behavior.
- `tests/unit/analytics-guard.test.ts` verifying disallowed keys trigger errors only in dev.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "analytics: add privacy opt-out and payload guards"

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
- Instrument lightweight health checks: console log counts in dev, optional `lib/analytics/metrics.ts` that exposes counters to existing debug overlay.
- Capture PostHog ingestion failures via `posthog.on('error')` and surface in Sentry (if available) or console with action items.

Validation

- Dry run release checklist in staging; confirm monitoring steps actionable.
- Trigger mock PostHog failure and verify error handler reports correctly without user-facing crash.

Tests

- `tests/unit/analytics-error-handler.test.ts` ensuring handler routes errors to logging layer.

Run & Commit

- `pnpm format:write && pnpm lint && pnpm typecheck && pnpm test`
- Commit: "analytics: add rollout guardrails and monitoring hooks"

—

## Completion

After Phase 5, run the full quality gates once more and update `CHANGELOG.md` summarizing analytics enablement. Coordinate with stakeholders to review dashboards and toggle the feature flag for production rollout.
