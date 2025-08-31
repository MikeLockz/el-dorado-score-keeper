# Test Plan: Simple, Durable, Multi‑Tab State

Validates the simplified design in STATE.md via automated tests only. No manual steps. Covers durability, replay/time‑travel, refresh/navigation resilience, duplicate tabs, and export/import.

## Scope

- Append‑only event log in IndexedDB with auto‑increment `seq`.
- Deterministic reducers and time travel by height.
- `state['current']` fast rehydration, optional snapshots.
- Cross‑tab sync via `BroadcastChannel` with `localStorage` fallback.
- Failure handling: retries, duplicates, crashes, corruption.
- Export/import fidelity.

## Test Environment

- Runner: `vitest` (or `jest`) in Node.
- IndexedDB: `fake-indexeddb` + `fake-indexeddb/auto` polyfill.
- BroadcastChannel: `broadcast-channel` ponyfill or lightweight mock.
- localStorage: in‑memory mock with `storage` event emitter.
- Browser E2E (optional): Playwright to validate real BroadcastChannel behavior in WebKit/Chromium/Firefox.
- Determinism: freeze/time‑control with `vi.setSystemTime` or Jest timers.

## Layers and Coverage Goals

- Unit (reducers/selectors): 95%+ lines/branches.
- Storage adapter: 90%+ lines; transactions, indices, cursors.
- Integration (single instance): end‑to‑end append → rehydrate.
- Multi‑tab: concurrent writers/readers across two instances.
- Property tests: generators for random valid event sequences.

## Test Utilities (helpers)

- `makeTestDB(name)` → isolated DB per test.
- `initInstance(dbName, chanName)` → returns `{ append, getState, getHeight, close }`.
- `drain()` → flush microtasks and timers.
- `seed(n)` → event factory with deterministic UUIDs.
- `withTabs(k)` → spins up k instances sharing DB + channel.

## Unit Tests

- Reducers determinism: same input sequence yields identical state (deepEqual), independent of timestamps.
- No side effects: reducers ignore wall clock; verify by stubbing Date and ensuring state equality.
- Golden sequences: curated event lists covering players, rounds, scoring, and settings; assert final state and derived totals.
- Selectors: totals, leaders, round summaries; memoization correctness (same inputs, same reference or cached outcome).

## Storage Adapter Tests (IndexedDB)

- Auto‑increment ordering: concurrent `add` calls from two contexts produce strictly increasing `seq` without gaps.
- Unique `eventId`: inserting the same event twice throws once; idempotent `append` treats duplicate as success and does not bump height.
- Transaction atomicity: force a failure after `events.add` but before `state.put` → entire transaction aborts; on restart, there is no partial state.
- Cursor from height: opening a cursor from `height+1` yields exactly the tail events.
- Snapshot optionality: writing a snapshot every 20 events and reading it back restores state identical to full replay.

## Integration Tests (Single Instance)

- Append and read back: append N events, verify `getHeight() === lastSeq` and `getState()` matches reducer replay from scratch.
- Restart rehydration: tear down instance, re‑init; verify it uses `state['current']` then applies the tail; same final state.
- Idempotent retry: simulate transient error on append (first call throws), retry with same `eventId`; verify one event in DB, correct height, correct state.
- Time travel view: set `viewHeight` to mid‑stream; derive state by replaying up to that height; verify UI selectors are consistent with preview.

## Multi‑Tab Tests (Two Instances)

- Concurrent writers: start A and B; fire 50 appends from each interleaved via `Promise.all`; both end with identical `height` and `state`.
- Broadcast sync: A appends; B receives channel ping and applies new events; assert B lags until message, then catches up.
- Missed broadcast: drop a message (mock channel). B periodically checks or applies on next message; eventually consistent and equal to A.
- Duplicate event across tabs: A and B both try to append same `eventId`; only one `events.add` succeeds, both instances converge to identical state.
- Fallback to localStorage: disable channel; use `storage` event path; verify cross‑tab sync still converges.

## Resilience and Failure Handling

- Crash during append: simulate abrupt instance close right after `events.add` enqueues but before commit; on next boot, either the transaction is absent (no event) or complete; state never reflects a half‑commit.
- Corrupt `state['current']`: write an invalid object or wrong shape; instance detects and rebuilds via full replay; final state equals expected.
- Corrupt event record: inject a malformed event (missing fields or bad type); rehydrator skips it and logs a warning; final state equals expected if event was non‑essential, or throws a controlled error if essential (configurable policy).
- Storage quota error: mock IDB quota error on append; instance surfaces a typed error; no partial writes and height unchanged.

## Export / Import

- Export round‑trip: generate events, export JSON bundle, wipe DB, import bundle, rehydrate; final state and height equal originals.
- Partial export: export only events; on import, rebuild `state['current']` via replay; state equals baseline.

## Property‑Based Tests

- Random event streams: generate 1–500 valid events; assert:
  - replay(full) equals fold(left) with incremental reducer.
  - rehydrate from random snapshot height equals full replay.
  - commutativity holds only where defined (e.g., unrelated settings vs scoring) — or explicitly assert non‑commutativity where order matters.
- Shrinking uncovers minimal counterexamples if invariants fail (e.g., totals negative).

## Performance/Scaling Checks (Deterministic)

- Startup cost: with 5k events and snapshots every 50, rehydration applies ≤ 50 tail events; assert bound on number applied, not on wall‑time.
- Append throughput: appending 100 events commits in ≤ X transactions (batching if implemented); assert transaction count, not time.

## CI Setup

- Run unit, storage, integration, and multi‑tab suites in Node with `fake-indexeddb`.
- Optionally, nightly Playwright job to run the multi‑tab tests in real browsers.
- Enforce coverage thresholds: reducers 95%, storage 90%, overall 85% lines.
- Flake guard: retry failing multi‑tab tests up to 2 times with different channel timing seeds.

## Test Data and Factories

- `player()` factory returns minimal valid player with deterministic ID.
- `score(delta)` creates a scoring event for a specific player/round.
- Scenario builders: `gameWithTwoPlayersAndThreeRounds()` returns events and expected final state.

## Required Test Hooks (implementation notes)

- Instance API exposes `append(event)`, `getState()`, `getHeight()`, `setViewHeight(h)`, `close()`.
- Optional `onCommitted(cb)` for observing commits in tests.
- Ability to inject custom `IDBFactory`, `BroadcastChannel`, and `localStorage` mocks.
- Feature flag to disable BroadcastChannel to exercise fallback path.

## Exit Criteria

- All tests pass in CI on Node 18+.
- Coverage thresholds met; mutation tests (optional) show reducers are robust.
- Manual testing is not necessary to validate durability, replay, refresh resilience, multi‑tab sync, undo/time‑travel, and export/import.
