# Phase 0 Journal — Baseline Guardrails

**Date:** 2025-09-21
**Owner:** Staff Engineer (Styling Migration)

## Summary

- Captured Tailwind usage inventory across `app/` and `components/` (see `docs/migrations/styling/baseline-matrix.csv`).
- Recorded production build, export, and landing Web Vitals baselines stored under `docs/migrations/styling/baseline-metrics/`.
- Landed guardrail regression test in `tests/ui/landing-snapshots.test.ts` ensuring ModeCard Tailwind utilities remain present until refactor.
- Configured Playwright smoke suite (`playwright.smoke.config.ts`) producing baseline screenshots for landing, single-player, and settings routes.
- Established stakeholder communication cadence (see `docs/migrations/styling/communication.md`).

## Manual QA & Validation

- Commands:
  - `pnpm lint` ✅
  - `pnpm format` ✅
  - `pnpm test` ❌ — currently fails on `tests/unit/game-flow/useNewGameRequest.test.tsx` (requireIdle guard) and `tests/ui/sp-desktop-ui.test.tsx` (fixture expectations). Coordinate with the single-player feature owners before Phase 1 kickoff.
- `pnpm build && pnpm next export` executed locally; artifacts captured in `baseline-metrics/next-build.log` and `next-export.log`.
- `pnpm test:playwright --update-snapshots` run to refresh smoke screenshots (see `tests/playwright/smoke.spec.ts`).
- Verified guardrail unit test fails when Tailwind classes removed (spot-checked by temporarily deleting `bg-card` utility prior to reverting).

## Risks & Follow-ups

- Snapshot guardrail currently tied to ModeCard only; consider adding secondary coverage for dialog primitives in Phase 2.
- Performance baselines use single run; plan to re-run with production profiling flag before Phase 4 comparisons.
- Need to set up CI check to ensure baseline artifacts stay in sync when `pnpm build` output shifts—track as Phase 1 follow-up.

## Sign-off Checklist

- [x] Tailwind usage inventory captured
- [x] Baseline build/export metrics collected
- [x] Guardrail unit test in place
- [x] Playwright smoke suite finalized with snapshots
- [x] Communication cadence documented
