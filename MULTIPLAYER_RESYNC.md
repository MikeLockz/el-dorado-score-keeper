# Multiplayer Resync & Snapshots — El Dorado

This document defines how clients recover state after reconnecting.

## Donor Selection

- Preferred donor: host.
- Fallback donors: any connected peer that reports a recent `seq`.
- Server role: relay only. It forwards `snapshot_request` to the host (or first eligible donor) and relays `snapshot` back to the requester.

## Client Flow

1. Reconnect WS and send `join{ roomId, playerId }`.
2. Send `snapshot_request{ sinceSeq }` where `sinceSeq` is the last applied broadcast `seq` saved locally.
3. On `snapshot{ baseSeq, bundle }`:
   - Import via `importBundleSoft(dbName, bundle)`.
   - Resume streaming broadcast messages from `baseSeq+1`.
4. If no snapshot arrives within timeout T (e.g., 5s) or all donors absent:
   - Show a friendly message and return to the lobby; allow manual retry.

## Client Pseudocode

```ts
async function rejoinAndResync(ws: WebSocket, roomId: string, playerId: string) {
  const lastSeq = Number(localStorage.getItem(`mp:room:${roomId}:lastSeq`) || '0');
  ws.send(JSON.stringify({ type: 'join', payload: { roomId, playerId } }));
  ws.send(JSON.stringify({ type: 'snapshot_request', payload: { roomId, sinceSeq: lastSeq } }));
  const timeout = createTimeout(5000);
  const snap = await waitFor<'snapshot'>(ws, 'snapshot', timeout);
  if (!snap) throw new Error('timeout');
  await importBundleSoft('app-db', snap.payload.bundle);
  updateLocalSeq(snap.payload.baseSeq);
  drainBufferedEventsFrom(snap.payload.baseSeq + 1);
}
```

## Snapshot Shape

- `ExportBundle` as already defined in `lib/state/io.ts`.
- Expected size: small (scorekeeper events are compact). No compression in MVP.
- Privacy: snapshot may include events that imply hidden info; MVP accepts this risk.

## Hashing (Optional for MVP)

- Clients may send `hash{ turnId, hash }` periodically for early desync detection.
- If mismatch: prompt the affected client to resync via snapshot.

## Timeouts and Backoff

- Snapshot wait timeout: 5s default.
- Reconnect backoff: start at 500ms, cap at 5s, jittered.
