**Architecture & State**
- **Event typing**: Define a discriminated union for `AppEvent` (e.g., `type: 'player/added' | ...`) with precise payload types; export event creators to remove `any` and stringly-typed usage.
- **Domain separation**: Extract score math and round rules into `lib/state/logic.ts` to keep reducers/UI lean and testable; reference from `reduce` and components.
- **ID/UUID util**: Centralize `uuid()` in `lib/utils.ts` and reuse; remove duplicates in components.
- **Selectors**: Expand typed selectors in `lib/state/selectors.ts` (totals per round, next actionable round, game completion) and have components consume selectors instead of ad hoc calculations.
- **Configurable rounds**: Make round count and trick schedule configurable (e.g., via constants or settings), keeping `reduce` pure and rules-driven.
- **Strict types**: Enable stricter TS (e.g., `noUncheckedIndexedAccess`) and remove remaining `any` usages in `instance.ts`/`io.ts` via small helpers and narrowed types.

**Reliability & Data**
- **IndexedDB schema**: Introduce explicit schema version constants and a migration note; guard index creation paths to avoid redundant checks; add tests for v1→v2 upgrades.
- **Event validation**: Validate event shape and payload (zod) on append; warn and reject malformed input consistently via `onWarn` with structured codes.
- **Snapshots**: Tune `SNAPSHOT_EVERY` based on typical event volume; add compaction job to prune old snapshots while retaining periodic anchors.
- **Rehydrate safety**: Harden `loadCurrent()` path to ignore invalid state records with metrics; fallback to last good snapshot and first principles; cover with tests.
- **Cross-tab sync**: Debounce/throttle BroadcastChannel/localStorage signals; add a monotonic seq check to prevent redundant catch-ups under races.
- **Archival atomicity**: Wrap archive + reset flows in a single function with error surfaces; add recovery if storage writes fail mid-archive.

**UI/UX & Accessibility**
- **Keyboard flows**: Ensure all bidding/made controls are keyboard-accessible; add `aria-pressed` to toggle buttons; define focus outlines and logical tab order.
- **Announce updates**: Add polite ARIA live region for round state and score changes to aid screen readers.
- **Color contrast**: Verify Tailwind palettes meet WCAG AA in all states; adjust tokens if needed.
- **Adaptive layout**: Replace JS text fitting in `FitRow` with CSS-first approach using `clamp()`, truncation, tooltips; keep JS fallback only where needed.
- **Error toasts**: Surface `warnings` from provider into a small non-blocking toast or inline banner with codes and friendly messages.
- **Empty/edge states**: Improve placeholders for 0 players, archived list empty, and scored-only views.

**Performance**
- **State updates**: Batch UI updates during rapid bid changes (e.g., wrap in React `startTransition`) to keep 60fps.
- **Memoization**: Use stable memoized selectors for heavy derived data (e.g., cumulative totals), avoiding recalculation per cell.
- **Render slices**: Virtualize tall round grids on small devices if needed; or chunk rendering by round with memoized row components.
- **Broadcast cost**: Post minimal messages across tabs (only seq/flags); coalesce storage events.

**Testing & Quality**
- **Coverage goals**: Target 85%+ statements/branches with Vitest; enable `--coverage` in CI; add tests for snapshots, migrations, archive/restore, and cross-tab races.
- **Property tests**: Extend property-based tests around random event streams and idempotence for duplicate `eventId`s.
- **Contract tests**: Add reducer contract tests per event type with valid/invalid payloads (using zod schemas).
- **Component tests**: Add focused tests for `CurrentGame` interactions (bidding, complete, finalize) using a lightweight DOM environment.
- **E2E**: Add Playwright smoke flows (add players → bid → finalize → archive → restore) on CI.

**Build & CI/CD**
- **CI workflow**: Add GitHub Actions for install → typecheck → lint → unit/integration → coverage upload; cache pnpm and Next build.
- **Static checks**: Add ESLint + Prettier with strict rules (unused vars, exhaustive deps); run `next lint` in CI.
- **Type budget**: Run `tsc --noEmit` in CI, fail on implicit anys and `@ts-ignore`.

**Developer Experience**
- **Devtools**: Expand devtools with event log viewer, time-travel apply, and warning feed; hide in prod; add copy/export bundle from UI.
- **Fixtures**: Provide seed scripts and sample export bundles for local testing.
- **Docs**: Add CONTRIBUTING.md with run/test/debug tips; document state machine and event catalog.

**Security & Privacy**
- **Data boundaries**: Clarify local-only storage; no PII collection; add a short privacy note in README.
- **Input sanitization**: Sanitize player names (trim, length limits, disallow control chars) at event creation.
- **Permission policy**: Set conservative security headers in Next config where applicable.

**PWA & Offline**
- **PWA polish**: Integrate a lightweight service worker (Next PWA) for offline shell; verify manifest/icons; add install prompt.
- **Upgrade flow**: Handle schema bumps gracefully on SW updates; clear caches on major versions.

**Documentation Enhancements**
- **State docs**: Expand `lib/docs/STATE.md` with diagrams and examples; add `EVENTS.md` listing each event and invariants.
- **Runbooks**: Add a short troubleshooting guide for IndexedDB issues (quota, blocked upgrades) and how the app recovers.

**Prioritized Next Steps**
- **P1**: Event typing + creators; input validation (zod); keyboard accessibility pass; CI with typecheck/lint/tests.
- **P2**: Selector expansion and component refactor to selectors; warning surfacing; snapshot tuning + tests.
- **P3**: Devtools upgrades; PWA offline shell; Playwright e2e; documentation (CONTRIBUTING, EVENTS).

**Acceptance Criteria Examples**
- **Type safety**: No `any` in state layer; `tsc --noEmit` passes with strict flags.
- **A11y**: Keyboard-only user can complete a full round; axe checks pass on key pages.
- **Reliability**: Duplicate `eventId` never double-applies; archive/restore round-trips state; migrations tested.
- **Perf**: Rapid bid changes keep main thread responsive; no layout thrash from text fitting.
