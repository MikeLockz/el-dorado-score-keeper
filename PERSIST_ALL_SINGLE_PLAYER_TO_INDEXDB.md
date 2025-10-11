# Persist All Single Player State to IndexedDB & Local Storage

## Background

Single player (SP) mode already relies on the global event log managed by `lib/state/instance.ts`. Every `append`/`appendMany` writes the authoritative state snapshot into IndexedDB (`STATE` store) and broadcasts a sync signal. Earlier stopgaps stored an SP-specific snapshot in `localStorage`, but that mirror was removed once the event store became the single source of truth (`docs/SINGLE_PLAYER_STATE_IMPROVEMENTS.md`). The new requirement is to:

- Ensure the full single player experience survives reloads and browser restarts even when IndexedDB is unavailable, delayed, or cleared independently.
- Persist SP game state to both IndexedDB and `localStorage` after every state-changing event without regressing performance or violating privacy.
- Provide a deterministic rehydrate path that is compatible with existing state management, routing, analytics, logging, error handling, performance monitoring, and test infrastructure.

## Goals & Constraints

- Persist all data required to resume the current SP game (rosters, round metadata, seeds, trick state, scores, analytics flags) in both IndexedDB and `localStorage`.
- Support deep-link routes of the form `/single-player/{gameId}/…` so a reload (or direct navigation) can rehydrate the matching game entirely from IndexedDB, using `gameId` as the lookup key.
- Capture updates after **every** reducer-visible change with minimal overhead (no layout thrash, no long main-thread blocks, <1ms typical writes).
- Maintain the event store as the source of truth; the `localStorage` mirror is a read-through cache/fallback, not a competing store.
- Avoid storing unnecessary or sensitive information (e.g., analytics tokens, experimental flags); limit persisted payload to SP-specific state and roster metadata already visible in the UI.
- Integrate cleanly with existing modules: `StateProvider`, `createInstance`, selectors, observability, and tests.

## Data Model

Define a versioned SP snapshot that can live side-by-side with the existing `state['current']` record in IndexedDB:

```ts
// lib/state/persistence/sp-snapshot.ts
export type SinglePlayerSnapshotV1 = {
  version: 1;
  height: number;             // matched IndexedDB seq
  savedAt: number;             // Date.now()
  gameId: UUID;               // stable id used in routes (/single-player/{gameId}/...)
  rosterId: UUID | null;
  roster: {
    playersById: Record<UUID, string>;
    playerTypesById: Record<UUID, 'human' | 'bot'>;
    displayOrder: Record<UUID, number>;
  } | null;
  humanId: string | null;
  sp: AppState['sp'];
  rounds: Record<number, RoundData>;
  scores: Record<string, number>;
  analytics: {
    sessionSeed: number | null;
    roundTallies: AppState['sp']['roundTallies'];
  };
};
```

Storage format:

- IndexedDB: continue storing `SinglePlayerSnapshotV1` inside the existing `STATE` store as part of the `current` record (`{ id: 'current', height, state }`) and mirror the latest `gameId` into a lightweight lookup map keyed by `gameId → height` for direct fetch by URL route.
- Local Storage: JSON string under `el-dorado:sp:snapshot:v1`. Keep payload ≤200 KB by storing only SP-specific slices (rounds, sp, roster metadata, scores subset, IDs). Use `JSON.stringify` with stable ordering helper to minimize diff noise.

## Write Path Updates

1. **Augment `createInstance`**
   - Introduce `persistSpSnapshot(state: AppState, height: number)` in `lib/state/persistence/sp-snapshot.ts`.
   - Call it from the existing catch-up pipeline immediately after `persistCurrent()` inside `enqueueCatchUp` for both `append` and `appendMany`. This guarantees IndexedDB and the mirror stay consistent at the same height.
   - Implementation details:
     - Derive snapshot via pure helper that clones only needed fields (structured cloning is cheaper than deep `JSON.parse(JSON.stringify(...))` on modern browsers).
     - Serialize asynchronously: schedule the `localStorage` write via `queueMicrotask` or `requestIdleCallback` (with a fallback) to avoid blocking the transaction completion path.
     - Deduplicate writes using a monotonic cache: compute a cheap checksum (e.g., 53-bit FNV of `JSON.stringify` result) and skip when unchanged.
     - Wrap access in `try/catch`; on failures (e.g., quota exceeded, private mode), log via `captureBrowserMessage('single-player.persist.failed', { level: 'warn', ... })` but do not reject the primary append promise.
      - Persist the `gameId → height` lookup atomically alongside `state['current']` (e.g., store under `STATE` key `sp/game-index` or a new `MAP` store) so route-based lookups always return a valid height.

   - Generate or reuse a `gameId` when the session transitions from `setup` to an active phase. Prefer an event (`sp/session-started { id, startedAt }`) so reducers remain deterministic and time-travel-safe; persist the id in both state and snapshot helper.

2. **Clear mirror when game resets**
   - Extend `events.spReset()`/`events.archiveCurrentGameAndReset()` flows to call `persistSpSnapshot(null, height)` which removes the localStorage key. Hook into the reducer detection (SP phase `setup` and `order.length === 0`) to clear stale mirrors automatically.

3. **Throttle multi-event batches**
   - `appendMany` already coalesces events. Ensure the snapshot helper receives the final state once per batch. Use an internal pending flag to avoid redundant scheduling inside the same `enqueueCatchUp` tick.

## Read Path & Rehydrate Strategy

1. **Boot-time fast path**
   - In `StateProvider`, inspect the initial URL. If it contains `/single-player/{gameId}`, try resolving `gameId` via the lookup map and hydrate that height from IndexedDB immediately; if resolution fails, fall back to the latest session.
   - Before the async IndexedDB rehydrate completes, attempt to load `SinglePlayerSnapshotV1` from `localStorage`. Validate version and height. If valid, prime `useState` with `state = mergeSpSnapshot(INITIAL_STATE, snapshot)` so the SP page renders the latest known data immediately. Keep `ready = false` until IndexedDB finishes to avoid inconsistencies if the mirror lags behind the event log.

2. **IndexedDB canonicalization & route binding**
   - After `createInstance.rehydrate()` completes, compare the local snapshot’s `height` with the DB’s `height`. If the DB is ahead, overwrite `localStorage` with the newer snapshot. If the local snapshot height is ahead (should be impossible under normal flow), discard the local copy and emit a warning.
   - When the app boots with a `/single-player/{gameId}` route, use the `gameId → height` lookup to load the matching snapshot from IndexedDB before React mounts the page; if missing, fall back to the canonical current game.

3. **Restore on navigation/reopen**
   - Because the snapshot includes `rosterId`, `roster`, and `sp` runtime, routing to `/single-player` can rely solely on the store. No changes required to router; `StateProvider` ensures state is ready before the page mounts.

4. **Graceful degradation**
   - If `localStorage` is unavailable (Safari private mode), snapshot loading simply returns `null` and the app falls back to IndexedDB.

## Security & Privacy

- Persist only data already present in the SP UI. No analytics user IDs, error logs, or PostHog session identifiers are stored.
- Names in the roster are user-provided and already persisted in IndexedDB; mirroring them locally does not introduce new exposure.
- Guard all localStorage access in `try/catch` and short-circuit when storage access throws (private mode, quota).
- Include a `version` field so future migrations can invalidate/clear old snapshots safely.

## Compatibility Considerations

- **State Management**: `StateProvider` and selectors remain unchanged; they consume `AppState`. The snapshot helper operates below that layer and therefore stays compatible with time travel (`previewAt`) and existing reducers.
- **Routing**: `/single-player` already derives all data from store selectors (`app/single-player/page.tsx`). Preloading the store from snapshot preserves routing flows.
- **Testing**: Update Vitest setup (`tests/setup/global.ts`) to include the new key in the in-memory `localStorage` mock. Add unit tests for `buildSinglePlayerSnapshot`, `persistSpSnapshot`, and `mergeSpSnapshot`. Extend integration tests to simulate reload by clearing React state, reloading from localStorage + IndexedDB, and ensuring the SP page resumes mid-round.
- **Analytics & Logging**: Continue using `applyRoundAnalyticsFromEvents`. Add observability hooks only on failure paths to avoid double-counting events. Respect analytics opt-out (`lib/observability/privacy.ts`) by avoiding localStorage writes when the user has disabled persistence (optional enhancement for future work).
- **Error Handling**: Reuse existing `captureBrowserMessage` flow for persistence warnings. Ensure failures do not reject `append` operations.
- **Performance Monitoring**: Wrap serialization time in `performance.mark`/`measure` (gated by DEV or `NEXT_PUBLIC_PERF_DEBUG`) if we need insight into heavy writes. Schedule writes during idle periods to avoid UI jank.
- **User Feedback**: Leverage existing toast/snackbar patterns only if we detect repeated failures (e.g., QuotaExceededError twice in a row). Initial implementation should remain silent to avoid noise.

## Testing Strategy

1. **Unit Tests**
   - `buildSinglePlayerSnapshot(state, height)` returns the minimal payload and excludes unrelated state.
   - `mergeSpSnapshot(INITIAL_STATE, snapshot)` reconstructs the store slice without mutating input.
   - `persistSpSnapshot` handles quota errors by logging and continues.

2. **Integration Tests (Vitest + JSDOM)**
   - Append SP events, assert that `localStorage['el-dorado:sp:snapshot:v1']` updates with correct height and includes the generated `gameId`.
   - Simulate reset event and ensure the key is removed.
   - Verify the `gameId → height` index returns the expected height and survives multiple sessions.

4. **Performance Regression Guard**
   - Add CI check measuring average append latency before/after enabling snapshots

## Rollout Plan

1. Implement snapshot helper module and wire into `createInstance` write path.
2. Add boot-time primer in `StateProvider` with feature flag `spSnapshotEnabled` defaulting to `true` in production once vetted.
3. Write automated tests and run existing suites (`pnpm test`, `pnpm test:ui`, `pnpm test:e2e`).
4. Manually verify in development: play SP game, reload, quit browser, reopen.
5. Monitor analytics/logging for persistence warnings after release; add toggle to disable if issues arise.

Promote the snapshot helper to a general-purpose persistence plugin.
