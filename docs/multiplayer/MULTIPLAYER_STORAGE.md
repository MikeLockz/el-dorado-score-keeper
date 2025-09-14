# Multiplayer Storage & Isolation — El Dorado

This document defines what to store locally and how to isolate per-room data.

## Local Keys (suggested)

- `mp:player:id` — stable `playerId` for this device.
- `mp:player:name` — preferred display name.
- `mp:lastRoom` — last joined `roomId` (for convenience join).
- `mp:room:<roomId>:lastSeq` — last applied broadcast `seq`.

## TypeScript Helpers (snippets)

```ts
function ensurePlayerId(): string {
  let id = localStorage.getItem('mp:player:id');
  if (!id) {
    id = uuid();
    localStorage.setItem('mp:player:id', id);
  }
  return id;
}

function getLastSeq(roomId: string): number {
  return Number(localStorage.getItem(`mp:room:${roomId}:lastSeq`) || '0');
}

function setLastSeq(roomId: string, seq: number) {
  localStorage.setItem(`mp:room:${roomId}:lastSeq`, String(seq));
}
```

## IndexedDB Namespace

- MVP: reuse existing DB names (`app-db`, `app-games-db`).
- Per-room isolation (optional later): prefix store keys with `room:<roomId>:` if in the same DB, or switch to per-room DB names.

## Cleanup

- On Leave or room expire:
  - Clear volatile per-room items like `mp:room:<roomId>:lastSeq`.
  - Keep `mp:player:id` and `mp:player:name` for convenience.
