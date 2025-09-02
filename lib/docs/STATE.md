# STATE: Simple, Durable, Multi‑Tab Safe

This is a simpler plan that still delivers: durability, replay/time‑travel, refresh/navigation resilience, and duplicate‑tab safety — without clocks, hash chains, or leader election.

## Overview

- Append‑only event log in IndexedDB with auto‑increment keys for ordering.
- Deterministic reducers to build state from events.
- Optional snapshots every N events to speed startup.
- BroadcastChannel for cross‑tab “new event” pings; `localStorage` as fallback.

## What We Store (IndexedDB)

- `events` (store)
  - keyPath: auto‑increment `seq` (global order across tabs)
  - value: `{ eventId, type, payload, ts }`
  - index: unique `eventId` to prevent duplicates
- `state` (store)
  - key: `'current'` → `{ height: number, state: AppState }`
- `snapshots` (store)
  - key: `height` → `{ height, state }` (optional)

## Event Shape

\`\`\`ts
type AppEvent<T = any> = {
eventId: string; // uuid v4
type: string; // e.g., 'player/added'
payload: T; // minimal intent
ts: number; // Date.now()
};
\`\`\`

## Write Path (Single Transaction)

1. Build `event` with `eventId`, `type`, `payload`, `ts`.
2. Start IndexedDB transaction over `events` and `state`.
3. `events.add(event)` returns assigned `seq` (global order).
4. Apply reducer to in‑memory state → `nextState` and `height = seq`.
5. Put `state['current'] = { height, state: nextState }`.
6. Commit, then `BroadcastChannel.postMessage({ type: 'append', seq })`.

Notes:

- If a duplicate `eventId` is retried, the unique index rejects it; we catch and treat as success (idempotency).
- UI considers the action “done” after the transaction completes.

## Startup/Rehydrate

1. Read `state['current']`. If missing, use `INITIAL_STATE` with `height = 0`.
2. Open a cursor on `events` starting at `height + 1` and apply tail events.
3. Subscribe to `BroadcastChannel('app-events')`; on `append`, fetch new events since last height.
4. Optionally, after applying ≥ N new events, write a snapshot and/or update `state['current']` (step 5 in Write Path already does this).

## Undo/Redo and Time Travel

- Time travel: maintain a `viewHeight` cursor in UI. To preview history, replay events up to `viewHeight` (or start from the nearest snapshot ≤ `viewHeight`).
- Undo: model as new events (e.g., `score/removed`, `round/reverted`). Simpler alternative: use `viewHeight` to let users step back visually; committing any new action appends after the head.

## Multi‑Tab Behavior (No Leader Election)

- Ordering: the auto‑increment `seq` provides a single, global order across tabs.
- Sync: the writing tab posts `{ type: 'append', seq }`. Other tabs pull and apply events `> currentHeight`.
- Fallback: if `BroadcastChannel` is unavailable, write `localStorage.setItem('app-events:lastSeq', String(seq))`. Other tabs listen to the `storage` event and pull.

## Resilience and Simplicity

- Crash/refresh: IndexedDB transactions are atomic. On boot, we resume from `state['current']` and apply any tail events.
- Corruption: if `state['current']` read fails (or parse error), rebuild by replaying all events. If an event read fails, skip it and continue; surface a warning to the user.
- Navigation: encode route in URL; refreshing keeps view. Ephemeral inputs can use `sessionStorage` keyed by tab.

## Export/Import

- Export: dump `{ events: [...], latestSeq }` to JSON.
- Import: clear DB, bulk insert events, rebuild `state['current']`.

## Performance Defaults

- Snapshot/update `state['current']` roughly every 20 events by default.
  The interval auto-tunes based on total event volume (e.g., 20 for small DBs,
  50–200 for larger ones) and can be overridden via `createInstance({ snapshotEvery })`.
  Old snapshots are compacted in the background: we keep a handful of the most
  recent snapshots and retain periodic historical anchors to bound startup cost
  without unbounded growth.
- Keep reducers pure and small; derive totals in selectors.

## Minimal Pseudocode

\`\`\`ts
// append
tx = db.transaction(['events','state'], 'readwrite')
seq = await tx.events.add(event) // ordered across tabs
next = reduce(memoryState, event)
await tx.state.put({ id: 'current', height: seq, state: next })
tx.commit()
broadcast.postMessage({ type: 'append', seq })

// rehydrate
let { height, state } = (await db.state.get('current')) ?? { height: 0, state: INITIAL }
for await (const e of db.events.range(height + 1, Infinity)) {
state = reduce(state, e)
height = e.seq
}
memoryState = state
\`\`\`

This approach stays small and understandable while meeting the requirements: durable actions, replay/time‑travel, resilience to refreshes, and safe multi‑tab usage — without extra systems we don’t yet need.
