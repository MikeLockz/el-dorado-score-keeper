# Tracking Issue Stub — New Relic Browser Rollout

- **Plan:** `NEW_RELIC_TELEMETRY.md`
- **Phase:** 5 — Manual QA & Observability Validation
- **Owner:** Staff Observability (temp placeholder until rollout owner assigned)
- **Status:** In progress (awaiting staging secrets & QA execution)

## Success Metrics

1. New Relic Browser agent initialized in staging with page view + JS error signals visible within 5 minutes of exercise.
2. Fallback log shim continues to operate when the agent path fails, ensuring no dark periods in logging during rollout.
3. No increase in client bundle size > 10kb gzip once the vendor registry + agent landing PRs are merged.

## Milestones

- [x] Phase 0 baseline recorded (`2025-10-03`)
- [x] Phase 1 vendor registry merged
- [x] Phase 2 agent integration merged
- [x] Phase 3 helper remap merged
- [x] Phase 4 env plumbing released
- [ ] Phase 5 staging validation complete
- [ ] Phase 6 cleanup merged

## Notes

- Baseline env vars: `NEXT_PUBLIC_OBSERVABILITY_ENABLED`, `NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY`, `NEXT_PUBLIC_APP_ENV` handled via `config/flags.ts` + `config/observability.ts`.
- Current shim lives in `lib/observability/browser.ts` with the pluggable New Relic agent (`lib/observability/vendors/newrelic/browser-agent.ts`) and log fallback (`lib/observability/vendors/newrelic/log-adapter.ts`).
- Tests covering the shim: `tests/unit/browser-telemetry.guard.test.ts`, `tests/ui/browser-telemetry-provider.test.tsx`.
- Update this stub with GitHub issue link once created.
- Staging credentials request for New Relic Browser (app ID, license key, script URL) opened with DevOps on `2025-10-06`; QA blocked until fulfilled.
