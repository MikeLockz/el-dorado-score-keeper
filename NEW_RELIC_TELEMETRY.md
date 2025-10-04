# New Relic Browser Telemetry Upgrade Plan

This plan documents the work required to graduate the lightweight log-only adapter into a full New Relic Browser monitoring integration while preserving a pluggable observability boundary. Each phase is sized for a mid- to senior-level frontend engineer and includes implementation steps, tests, validation, documentation, and commit guidance.

---

## Phase 0 – Baseline Verification & Kickoff

**Goal:** Confirm the current shim baseline, capture requirements, and prepare the repo.

- Implementation
  - Confirm `NEXT_PUBLIC_OBSERVABILITY_ENABLED`, `NEXT_PUBLIC_HDX_API_KEY`, and `NEXT_PUBLIC_APP_ENV` support the trial adapter.
  - Audit `lib/observability/browser.ts` usage to catalogue entry points (`BrowserTelemetryProvider`, helper exports, tests).
  - Create tracking issue linking this plan, success metrics, and the rollout owner.
- Tests / Validation
  - Run `pnpm typecheck`, `pnpm test:dom`, and a local Next dev session to confirm no regressions before starting.
- Docs
  - Note any tribal knowledge in `SCRATCH_PAD.md` or the tracking issue.
- Commit
  - No code changes expected; if minor cleanups are made, commit as `chore(obs): document new relic rollout baseline`.

**Exit criteria:** Baseline captured, tracking issue opened, and current shim verified.

### Phase 0 Baseline Notes — 2025-10-03

- `config/flags.ts` currently drives `NEXT_PUBLIC_OBSERVABILITY_ENABLED` and feeds `isObservabilityEnabled('browser')`; `config/observability.ts` validates `NEXT_PUBLIC_HDX_API_KEY` and `NEXT_PUBLIC_APP_ENV` before returning the shim config.
- `app/browser-telemetry-provider.tsx` lazy-loads `ensureBrowserTelemetry` and emits `page.viewed`; helper exports (`captureBrowserException`, `captureBrowserMessage`, `trackBrowserEvent`) are consumed by error boundary, game flows, dev tools, and landing quick links.
- Unit coverage exists in `tests/unit/browser-telemetry.guard.test.ts` (guards / error paths) and `tests/ui/browser-telemetry-provider.test.tsx` (pageview wiring); additional integration is deferred to later phases once the vendor registry lands.
- Tracking issue stub recorded in `docs/tracking/new-relic-browser.md` with rollout owner, success metrics, and links back to this plan pending upstream GitHub issue creation.

---

## Phase 1 – Generalize Vendor Abstraction

**Goal:** Make the browser telemetry loader vendor-agnostic so future switches are low effort.

- Implementation
  - Introduce a `config/observability-provider.ts` (or extend existing config) exposing `provider: 'newrelic' | 'custom'` with a sane default.
  - Rename the webpack/TS alias from `@hyperdx/browser` to `@obs/browser-vendor` (or similar) and update imports.
  - Move the New Relic shim into `lib/observability/vendors/newrelic/log-adapter.ts` and create a vendor registry that resolves based on provider.
  - Add a no-op fallback vendor to preserve behaviour when telemetry is disabled or misconfigured.
- Tests / Validation
  - Update existing unit tests (e.g., `tests/unit/browser-telemetry.guard.test.ts`) to cover the vendor registry behaviour.
  - Run `pnpm test:dom` and `pnpm test:node` to ensure cross-project coverage.
- Docs
  - Document the new vendor registry in `OBSERVABILITY.md` and reference future vendors in `SCRATCH_PAD.md`.
- Commit
  - Commit as `refactor(obs): generalize browser telemetry vendor registry`.

**Exit criteria:** Telemetry loader no longer references HyperDX directly and resolves vendors through a configurable registry.

### Phase 1 Progress Notes — 2025-10-03

- Added `config/observability-provider.ts` to expose the browser vendor flag with sane defaults and dev warnings for unknown values.
- Replaced the `@hyperdx/browser` alias with `@obs/browser-vendor/*` and introduced a vendor registry that lazy-loads providers.
- Moved the New Relic log shim to `lib/observability/vendors/newrelic/log-adapter.ts`, added a reusable no-op adapter, and wired `lib/observability/vendors/custom.ts` to fan out to both PostHog and New Relic when `NEXT_PUBLIC_OBSERVABILITY_PROVIDER=custom`.
- Updated `lib/observability/browser.ts` to resolve vendors through the registry, preserving the observability boundary and soft-failing to the shared no-op adapter.
- Extended existing unit coverage to assert provider switching behaviour and renamed documentation to reflect the new registry.

---

## Phase 2 – Integrate New Relic Browser Agent

**Goal:** Replace the log-only shim with the official Browser agent while keeping it optional and lazy.

- Implementation
  - Install `@newrelic/browser-agent` (or inject the CDN snippet gated by env) and wrap loading logic inside the New Relic vendor module.
  - Ensure agent bootstrap respects the feature flag and executes only in the browser environment.
  - Configure agent init with `licenseKey`, `applicationId`, `distributedTracing`, and auto-instrumentation options required by New Relic Browser.
  - Retain an escape hatch to fall back to log-ingest if the agent fails to load (surface console warning).
- Tests / Validation
  - Add unit tests that mock the agent loader to verify init happens once and failure paths downgrade gracefully.
  - Exercise `BrowserTelemetryProvider` in the JSDOM test suite to assert pageview tracking uses the agent API.
  - Run `pnpm test` and `pnpm build` locally.
- Docs
  - Update `README.md` and `OBSERVABILITY.md` with setup steps: obtaining the Browser app ID, required env vars, and troubleshooting instructions.
- Commit
  - Commit as `feat(obs): load new relic browser agent behind feature flag`.

**Exit criteria:** The agent loads lazily, collects real user monitoring data, and tests cover success/failure paths.

### Phase 2 Progress Notes — 2025-10-03

- Introduced `lib/observability/vendors/newrelic/browser-agent.ts` to load the CDN snippet, queue telemetry until the SDK is ready, and fall back to the existing log adapter when configuration is incomplete or the agent fails to boot.
- Extended `config/observability.ts` and vendor types so the browser runtime can read the New Relic Browser identifiers (`NEXT_PUBLIC_NEW_RELIC_BROWSER_*`) while keeping legacy `NEXT_PUBLIC_HDX_*` keys as defaults.
- Updated the vendor registry, docs, and unit harness to reference the new agent module and expanded tests to cover the additional environment permutations.

---

## Phase 3 – Map Existing Helper APIs to New Relic Calls

**Goal:** Preserve the public `BrowserTelemetry` contract while routing behaviour to New Relic equivalents.

- Implementation
  - Implement `track` using `newrelic.addPageAction` with merged attributes (`environment`, `service.name`, page metadata).
  - Implement `captureException` via `newrelic.noticeError`, attaching sanitized attributes and stack traces.
  - Implement `captureMessage` using a custom event or `addPageAction` with a dedicated event name.
  - Ensure SPA navigations trigger `newrelic.interaction().setName(...)` or `newrelic.setCustomAttribute` to reflect route changes.
- Tests / Validation
  - Extend `tests/unit/browser-telemetry.guard.test.ts` to assert New Relic APIs are called with expected payloads (mock the agent module).
  - Run `pnpm test:dom` to validate provider integration.
- Docs
  - Update helper docstrings (inline) and add usage examples in `docs/observability/next.md`.
- Commit
  - Commit as `feat(obs): route telemetry helpers through new relic browser api`.

**Exit criteria:** All helper functions align with the new agent and unit tests cover the mapping.

### Phase 3 Progress Notes — 2025-10-04

- `lib/observability/vendors/newrelic/browser-agent.ts` now decorates `page.viewed` events with `route.*` custom attributes and renames the active SPA interaction via `newrelic.interaction().setName(...)`, while still downgrading cleanly to the log adapter when the agent fails.
- Added `tests/unit/vendors.newrelic.browser-agent.test.ts` to exercise the agent wiring, route metadata propagation, and the log-fallback behaviour for both actions and exception capture.
- Documented the helper API in `docs/observability/next.md` (new usage examples) and refreshed inline docstrings in `lib/observability/browser.ts` so downstream teams know how to trigger the New Relic-aware helpers.

---

## Phase 4 – Environment & Build Plumbing

**Goal:** Ensure configuration/env naming is accurate for New Relic while keeping compatibility.

- Implementation
  - Introduce explicit env vars for New Relic Browser (`NEXT_PUBLIC_NEW_RELIC_APP_ID`, `NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY`) while still reading legacy names for backward compatibility.
  - Update the config schema to validate the new vars and deprecate the old HyperDX-prefixed ones with warnings.
  - Update Next.js build aliases and `tsconfig` path mappings to reflect the new vendor module names.
- Tests / Validation
  - Add unit tests verifying configuration error messages and fallback behaviour when new vars are absent.
  - Run `pnpm typecheck` to catch TS path issues.
- Docs
  - Revise `.env.example` (if present) and config sections in `README.md`/`OBSERVABILITY.md`.
- Commit
  - Commit as `chore(obs): align env schema with new relic config`.

**Exit criteria:** Configuration reflects New Relic naming, with compatibility shims documented and working.

---

### Phase 4 Progress Notes — 2025-10-05

- `config/observability.ts` now prefers `NEXT_PUBLIC_NEW_RELIC_*` env vars for ingest, host, and service names while preserving `NEXT_PUBLIC_HDX_*` fallbacks that emit development warnings.
- Unit tests cover the new env selection logic, including deprecation warnings when legacy keys are used.
- `.env.example`, `.env.local.example`, README, and observability docs were rewritten to reference the New Relic variables; scripts (`observability:smoke`, proxy helper) guide engineers to the new names.

---

## Phase 5 – Manual QA & Observability Validation

**Goal:** Validate the end-to-end experience in a real environment before rollout.

- Implementation
  - Deploy to a staging environment with `NEXT_PUBLIC_OBSERVABILITY_ENABLED=true`, license key, and app ID set.
  - Exercise key user journeys (login, navigation, data entry) and inspect New Relic Browser dashboards for page views, JS errors, AJAX timings.
  - Verify log ingestion still works when the Browser agent is unavailable or disabled.
- Tests / Validation
  - Capture screenshots or HAR files showing New Relic UI events for acceptance criteria.
  - Re-run automated suite (`pnpm test`, `pnpm build`) to ensure no regressions post-deploy.
- Docs
  - Update the tracking issue with QA notes, screenshots, and sign-off from stakeholders.
- Commit
  - No code changes expected; if small fixes are needed, commit as `fix(obs): <description>`.

**Exit criteria:** Stakeholders confirm data quality in New Relic; fallback behaviour verified.

### Phase 5 Execution Checklist

- **Pre-flight setup**
  - Confirm staging `.env` values (`NEXT_PUBLIC_OBSERVABILITY_ENABLED`, `NEXT_PUBLIC_NEW_RELIC_APP_ID`, `NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY`, host/service overrides) are present in the deployment system and masked secrets are scoped to the staging project.
  - Verify feature flags/config APIs that hydrate `NEXT_PUBLIC_APP_ENV` still resolve to `staging` post-deploy.
- **Deploy + warmup**
  - Cut a staging build from the latest Phase 4 commit and redeploy the static assets.
  - Wait for the CDN to propagate (~5 minutes) and hard-refresh the app to ensure the newest bundle is served.
- **User journey validation**
  - Execute happy paths and edge cases listed in the QA matrix below while the browser devtools network tab is recording.
  - Capture timestamps (UTC) for each interaction so New Relic queries can filter the event stream precisely.
- **Observability validation**
  - In New Relic, open the Browser → Events explorer and run NRQL saved views:
    - `FROM PageView SELECT count(*) WHERE appName='el-dorado-score-keeper-web-staging' SINCE 30 minutes AGO`.
    - `FROM JavaScriptError SELECT count(*), latest(errorMessage) FACET requestUri SINCE 30 minutes AGO`.
    - `FROM PageAction SELECT latest(actionName), latest(attributes.routeName) WHERE actionName IN ('game.started','client.error','continue.clicked') SINCE 30 minutes AGO`.
  - Confirm custom attributes `environment`, `service.name`, and `route.name` appear on each event type.
- **Fallback verification**
  - Temporarily block the agent script (`nr-loader-spa-*.js`) via devtools or feature flag, reload, and ensure:
    - Console warns about agent bootstrap failure.
    - Log shim continues to emit `client.error` payloads (inspect proxy/log forwarding).
    - Application remains functional with no uncaught errors.
- **Regression sweep**
  - Re-run `pnpm test`, `pnpm build`, and smoke the landing page locally to catch regressions introduced during QA fixes.

#### Phase 5 QA Matrix

| Flow                   | Steps                                                 | Expected New Relic Signals                                                                         |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Login/landing          | Load `/`, open drawer, navigate to `Login`            | `PageView` with `route.name=/`, `PageAction` `navigation.drawer.opened`, no JS errors              |
| Start new game         | From landing, choose `Start New Game`, complete setup | `PageAction` `game.started`, `PageView` route `/game/play`, SPA interaction renamed to `game/play` |
| Continue existing game | Use continue CTA, resume play, end turn               | `PageAction` `continue.clicked`, `JavaScriptError` count stays flat, AJAX timings recorded         |
| Error boundary         | Trigger known safe error (e.g., cheat console action) | `JavaScriptError` with `error.message`, `PageAction` `client.error` including `attributes.context` |
| Observability disabled | Toggle feature flag off, reload                       | No New Relic traffic, console info logs appear, helpers become silent                              |

#### Evidence Capture

- Store New Relic dashboard screenshots or HAR exports in `docs/tracking/new-relic-browser.md` (link from the tracking issue).
- Record observer, date, environment, and NRQL snippets used to verify each flow.
- Note any follow-up tickets for discrepancies (e.g., missing attributes, high error counts) before sign-off.

### Phase 5 Progress Notes — 2025-10-06

- Coordinated with DevOps to provision staging secrets for `NEXT_PUBLIC_NEW_RELIC_APP_ID`, `NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY`, and script URL; awaiting confirmation before redeploy.
- Drafted the execution checklist, QA matrix, and evidence capture guidelines above so QA can begin as soon as staging credentials land.
- Scheduled a pairing session with the observability owner to walk through dashboard queries and confirm fallback expectations prior to sign-off.
- Identified manual regression areas (continue flow, error boundary) likely to surface telemetry issues and outlined them in the QA matrix for focused testing.

---

## Phase 6 – Cleanup & Migration Support

**Goal:** Remove legacy references, finalize documentation, and prepare for future provider switches.

- Implementation
  - Remove HyperDX-specific env names once all environments use the new vars (or mark them deprecated with warnings slated for removal).
  - Introduce an adapter template in `lib/observability/vendors/README.md` (or similar) explaining how to implement alternative providers.
  - Optionally add an integration test stub that can be reused when swapping vendors.
- Tests / Validation
  - Run full suite again (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`).
- Docs
  - Add a migration section to `OBSERVABILITY.md` and update `NEW_RELIC_TELEMETRY.md` with completion notes.
- Commit
  - Commit as `chore(obs): remove legacy hyperdx scaffolding`.

**Exit criteria:** Codebase reflects the New Relic integration cleanly, with clear instructions for future provider swaps.

### Phase 6 Progress Notes — 2025-10-07

- Renamed the client provider to `BrowserTelemetryProvider` and updated layout/tests so the public API no longer references HyperDX.
- `config/observability.ts` now exports `getBrowserTelemetryConfig`, removing the legacy `NEXT_PUBLIC_HDX_*` fallback keys and tightening schema validation around the New Relic env family.
- Browser telemetry helpers and guard suites consume the renamed config/type and assert the default New Relic host, keeping expectations aligned with the new schema.
- Support tooling dropped HyperDX-specific env flags (`NR_PROXY_*` / `NR_PROXY_VERBOSE` replace `HDX_PROXY_*`), and the lightweight smoke script now references the New Relic aliases exclusively.
- Documentation refreshed across `OBSERVABILITY.md`, `README.md`, `docs/observability/next.md`, and the tracking stub to reflect the new provider name, updated env guidance, and the availability of a vendor adapter template.
- Added `lib/observability/vendors/README.md` describing how to implement alternative adapters and register them with the vendor registry.

---

## Rollout & Follow-up Checklist

- [ ] Tracking issue closed with links to merged PRs and QA evidence.
- [ ] Production deploy complete with New Relic Browser data flowing.
- [ ] Knowledge transfer session or Loom recording produced.
- [ ] Post-launch monitoring scheduled (review dashboards after 24h/7d).
- [ ] Plan archived in `docs/` or knowledge base, noting any follow-up work.

---

## Appendix – Suggested PR Breakdown

1. Vendor registry refactor (Phase 1).
2. Browser agent integration (Phase 2).
3. Helper wiring and tests (Phase 3).
4. Env plumbing update (Phase 4).
5. Cleanup/deprecation removal (Phase 6).

Each PR should:

- Include automated test run output in the description.
- Tag relevant reviewers (observability owner, FE lead).
- Link back to the tracking issue and this plan.
