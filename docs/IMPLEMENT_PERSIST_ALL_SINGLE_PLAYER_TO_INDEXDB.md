# Implementing Single Player Snapshot Persistence

This implementation runbook operationalizes the @PERSIST_ALL_SINGLE_PLAYER_TO_INDEXDB requirements. It decomposes the effort into prioritized phases that respect existing state-management patterns, emphasize maintainability, and guard IndexedDB/localStorage performance. Each phase enumerates concrete deliverables, testing expectations, and validation gates so we can commit with confidence at the end of the phase.

## Phase Prioritization Assessment

| Phase                                                     | Impact | Effort | Risk | Rationale                                                                                                                            |
| --------------------------------------------------------- | ------ | ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Snapshot Schema & Infrastructure                       | 5      | 3      | 3    | Establishes typed snapshot helpers and storage shims; unlocks downstream work while touching a limited surface area.                 |
| 2. Write Path Integration & Mirror Synchronization        | 5      | 4      | 4    | Hooks persistence into `createInstance` append flows; highest leverage but risks regressions without careful batching safeguards.    |
| 3. Rehydrate Pipeline & Route Lookup                      | 4      | 3      | 3    | Enables `/single-player/{gameId}` deep links and fallback reads; moderate effort with manageable risk once persistence is stable.    |
| 4. Resilience, Instrumentation, & Documentation Hardening | 3      | 2      | 2    | Tightens observability, failure handling, and user-facing docs; lowest risk but important for long-term maintainability and support. |

Score key: 1 (lowest) to 5 (highest). Ordering optimizes impact/effort while ensuring that higher-risk integration work lands after core primitives exist.

---

## Phase 0 – Discovery (Complete)

- **Goal**: Baseline requirements captured in `PERSIST_ALL_SINGLE_PLAYER_TO_INDEXDB.md`, including data model expectations and write/rehydrate constraints.
- **Status**: Complete. Treat as the authoritative spec for data fields, privacy constraints, and sequencing expectations.
- **Validation Artifact**: Spec reviewed and ratified by gameplay, platform, and QA stakeholders; no additional work required in this phase.

---

## Phase 1 – Snapshot Schema & Infrastructure

### Objectives

- Introduce a versioned `SinglePlayerSnapshotV1` type and pure helpers that derive snapshots without mutating global state.
- Scaffold IndexedDB and localStorage adapters that can read/write snapshots while preserving the existing `STATE` store contract.
- Create lightweight checksum/dedupe utilities to avoid redundant writes.

### Entry Criteria

- Event store append flows and `StateProvider` are stable on `main`.
- No pending migrations touching `lib/state/persistence`.
- Agreement on snapshot field inventory (per spec) validated with gameplay leads.

### Implementation Tracks

- Add `lib/state/persistence/sp-snapshot.ts` exporting type definitions, snapshot derivation helper, and checksum helpers (e.g., 53-bit FNV).
- Provide `persistSpSnapshot(state: AppState | null, height: number)` that orchestrates IndexedDB and localStorage writes via existing `persistCurrent` mechanisms.
- Implement `loadLatestSnapshot()` and `clearSnapshot()` utilities for later phases.
- Introduce a monotonic cache (module-level) that stores the last height + checksum to skip duplicate serialization attempts.
- Ensure helpers stay framework-agnostic so they can be unit-tested without IndexedDB mocking complexities (inject adapters).

### Best Practices & Performance

- Keep snapshot derivation pure: accept `AppState`, return plain objects with primitive/JSON-friendly types.
- Use stable key ordering when stringifying for checksums to reduce noise and enable deterministic cache hits.
- Guard localStorage access behind `typeof window !== 'undefined'` and try/catch to protect SSR and private-browsing paths.
- Follow existing persistence folder layout and naming conventions to minimize diffs for reviewers.

### Testing & QA

- Vitest unit tests for snapshot derivation (correct fields, version tagging, absence of excluded analytics tokens).
- Unit tests for checksum/dedup helpers, including collision smoke tests and behavior on unchanged snapshots.
- Contract tests for adapter interfaces using in-memory mocks (no real IndexedDB during unit tests).

### Validation Checklist

- [ ] `lib/state/persistence/sp-snapshot.ts` exports covered by tests.
- [ ] Running `pnpm lint` produces no new warnings.
- [ ] Running `pnpm test --filter sp-snapshot` (or equivalent suite) passes locally.
- [ ] Documentation: add section to `docs/SINGLE_PLAYER_STATE_IMPROVEMENTS.md` explaining the snapshot schema reference.
- [ ] Commit tagged `feat: scaffold single-player snapshot persistence primitives` pushed after review.

---

## Phase 2 – Write Path Integration & Mirror Synchronization

### Objectives

- Wire `persistSpSnapshot` into the append pipeline so every reducer-visible change persists to both IndexedDB and localStorage at the same height.
- Maintain atomicity between `state['current']` updates, snapshot storage, and `gameId → height` lookup entries.
- Ensure write scheduling does not regress UI responsiveness.

### Entry Criteria

- Phase 1 helpers merged and available.
- CI green on `main`; no active feature flags that pause append flows.
- Agreement with QA on representative replay scenarios for regression testing.

### Implementation Tracks

- Update `lib/state/instance.ts` (or equivalent) to invoke `persistSpSnapshot` immediately after `persistCurrent` within `enqueueCatchUp` for both `append` and `appendMany`.
- Add IndexedDB logic to store the snapshot within the `STATE` store alongside `current`, plus a `sp/game-index` map for `gameId → height` lookups (reuse existing transaction patterns).
- Schedule localStorage writes via `queueMicrotask` or `requestIdleCallback` fallback to minimize main-thread impact.
- Handle error cases by logging via `captureBrowserMessage('single-player.persist.failed', …)` without rejecting the append promise.
- Extend reset/archival flows (`events.spReset`, `events.archiveCurrentGameAndReset`) to call `clearSnapshot` so mirrors stay in sync.

### Best Practices & Performance

- Reuse existing transaction instances to avoid opening parallel IndexedDB transactions per append.
- Batch operations within `appendMany` to maintain atomic persistence and prevent partial writes.
- Skip persistence when `state.sp` reflects no active session (e.g., still in setup) unless a `gameId` exists to avoid storing empty payloads.
- Document fallback order (IndexedDB → localStorage → cold start) inline for maintainers.

### Testing & QA

- Integration tests around `appendMany` verifying that `persistSpSnapshot` fires once per batch and stores consistent `height` values.
- Unit tests mocking IndexedDB adapters to assert `gameId → height` index updates correctly.
- Regression tests ensuring reset flows clear both IndexedDB snapshot and localStorage mirror.
- Playwright (or existing end-to-end) smoke test: play a round, refresh, confirm persisted snapshot remains consistent.

### Validation Checklist

- [ ] IndexedDB `STATE` store contains `current` with embedded snapshot and updated `sp/game-index` entry.
- [ ] LocalStorage writes deduplicated (checksum cache prevents redundant operations in test logs).
- [ ] `pnpm lint`
- [ ] `pnpm test --filter persistence`
- [ ] Update `README.md` or dedicated persistence doc with instructions for clearing SP caches during debugging.
- [ ] Commit tagged `feat: persist single-player snapshot on append` merged after review.

---

## Phase 3 – Rehydrate Pipeline & Route Lookup

### Objectives

- Enable deterministic rehydration of `/single-player/{gameId}` routes using IndexedDB snapshot data, falling back to localStorage when offline.
- Provide utilities and hooks that integrate with `StateProvider` to load snapshots before rendering gameplay UI.
- Ensure analytics and logging respect the restored game context.

### Entry Criteria

- Phase 2 persistence in production behind any necessary feature flag toggles.
- Confirmed route patterns and `gameId` generation events available in state.
- Agreement from design/product on loading states and error UX for restore failures.

### Implementation Tracks

- Create a rehydrate service (e.g., `lib/state/persistence/sp-rehydrate.ts`) that, given a `gameId`, resolves the latest height via `gameId → height`, fetches the snapshot, and applies it to the in-memory store before continuing normal append replay.
- Hook the service into single-player route loaders or page-level effect so that hydration occurs before first render; show skeleton/loading indicators during fetch.
- Implement fallback: if IndexedDB fetch fails, attempt localStorage snapshot. Log recoveries and escalate irrecoverable failures to existing error boundary pipeline.
- Ensure restored state triggers any late-bound analytics initializers (session seed, tallies) without double-counting.
- Provide developer-facing utility to wipe cached snapshots (for QA toggling between accounts/games).

### Best Practices & Performance

- Keep rehydrate logic idempotent; safe to call multiple times with same `gameId`.
- Use existing promise queues or suspense boundaries to avoid race conditions between rehydrate and live event streaming.
- Abort fetch if user navigates away to avoid outdated state injection.
- Maintain SSR compatibility by gating browser-only APIs.

### Testing & QA

- Unit tests for rehydrate service covering IndexedDB hit, localStorage fallback, and failure paths.
- Component/integration tests ensuring the single-player page displays restored state without flicker or inconsistent scores.
- End-to-end test: deep-link into an existing `gameId`, verify scoreboard/round state matches pre-refresh snapshot.
- Monitoring dashboards validated for rehydrate success/failure counts.

### Validation Checklist

- [ ] Deep-link `/single-player/{existingGameId}` restores gameplay seamlessly in supported browsers.
- [ ] LocalStorage fallback path covered by automated tests.
- [ ] `pnpm lint`
- [ ] `pnpm test --filter "sp rehydrate"`
- [ ] Docs: add troubleshooting section covering cache clears and rehydrate expectations (`docs/single_player_troubleshooting.md` or equivalent).
- [ ] Commit tagged `feat: rehydrate single-player sessions from snapshot` merged after review.

---

## Phase 4 – Resilience, Instrumentation, & Documentation Hardening

### Objectives

- Strengthen observability, guardrails, and documentation to support long-term maintenance and incident response.
- Validate storage limits, retention policies, and privacy posture.
- Update operational runbooks and UX messaging around persistence.

### Entry Criteria

- Phases 1–3 deployed and stable in production (no critical bugs outstanding).
- Analytics team aligned on new telemetry fields (`single-player.persist.*`).
- Support/documentation owners available for review.

### Implementation Tracks

- Add metrics/logging hooks for snapshot save duration, failure counts, and fallback activations (StatsD, LogRocket, or existing pipeline).
- Implement storage quota checks and user-facing warnings when persistence fails repeatedly.
- Document manual recovery steps for support (clearing caches, capturing debug info).
- Review data retention/privacy compliance; ensure snapshots exclude sensitive fields and respect opt-out flags.
- Backfill automated cleanup tasks if archived games exceed retention budget.

### Best Practices & Performance

- Use lazy logging (structured payloads) to avoid string concatenation overhead on hot paths.
- Gate support warnings behind debounced triggers to prevent alert fatigue.
- Keep documentation close to code (`docs/` directory) with cross-links from existing single-player guides.

### Testing & QA

- Unit tests for telemetry helpers (ensure handles success/failure cases without throwing).
- Integration tests verifying quota warning UX triggers at configured thresholds.
- Documentation lint/build (if applicable) to ensure new sections render correctly.
- Chaos testing: simulate IndexedDB unavailability to confirm fallback + alerting pipeline works.

### Validation Checklist

- [ ] Telemetry visible in dashboards with expected cardinality.
- [ ] Quota warning surfaced during simulated storage exhaustion.
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] Docs updated: persistence section in `README.md`, support runbook, and changelog entry.
- [ ] Commit tagged `chore: harden single-player persistence resilience` merged after review.

---

## Ongoing Governance

- Add persistence-related checks to release checklist (QA sign-off for save/restore flows on supported browsers).
- Review snapshot schema quarterly to ensure compatibility before changes to `AppState['sp']` land.
- Maintain test fixtures that mirror real snapshots so future refactors catch serialization regressions.
- Keep changelog entries for user-visible persistence improvements or known limitations.

Adhering to this phased plan, with validation gates and documentation updates at each step, ensures we meet the resilience goals without sacrificing performance or maintainability.
