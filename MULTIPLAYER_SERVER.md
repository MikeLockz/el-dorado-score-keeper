# Multiplayer Server (Stateless Relay) — El Dorado

This document specifies the stateless relay server used for online multiplayer. It assigns order to client messages, manages ephemeral rooms, and relays data between clients. It does not persist game state.

## Goals

- Stateless by design: no database. If the server restarts, clients reconnect and resync from peers.
- Deterministic ordering: per-room, strictly increasing `seq` on all broadcast messages.
- Minimal surface: one WebSocket endpoint (optionally a health HTTP endpoint).
- Privacy: server does not need to inspect or persist hands/state; it only enforces timing/ordering and relays messages.

## Rooms and Presence

- Room record (in-memory): `{ roomId, hostId, seq, clients[], createdAt }`.
- Clients tracked by `{ connectionId, playerId, name, lastSeenAt, isHost }`.
- Max players: 10 (configurable). Spectators may be allowed but do not count toward turn order.
- Heartbeats: clients send `pong` (or `ping`/`pong` pair); if inactive beyond timeout T, mark disconnected and broadcast roster.

## Connection Lifecycle

1. Connect WebSocket to `/ws` (or similar). Optionally present an auth token.
2. Client sends `join{ roomId, playerId?, name, clientVersion }`.
   - If `playerId` missing, server assigns one for the session; client persists it locally for reconnects.
   - First joiner becomes `hostId`. Host can be reassigned via `roster` update.
3. Server replies with `roster` and starts relaying messages for the room.
4. On disconnect, server marks the player `connected=false` and updates `roster`.

## Message Envelope

- Direction: client→server and server→client (broadcast or private relay).
- Base shape:
  - `roomId`: string
  - `seq`: number | null (server fills for ordered broadcasts)
  - `type`: string (see message catalog below)
  - `payload`: object
  - `ts`: number (server may overwrite or add for canonical timing)
- Ordering: server assigns `seq = ++room.seq` for all broadcasted messages that affect shared state.
- Reliability: single-WS best-effort; clients handle reconnect + resync via peer snapshot (see below).

## Message Catalog

Lobby/control (also documented in MULTIPLAYER_LOBBY.md)

- `join` (client→server): { roomId, playerId?, name, clientVersion }
- `roster` (server→clients): { roomId, players: [{id,name,connected}], hostId, maxPlayers }
- `start` (host→server): { roomId, seed, order, rulesVersion, options }
- `leave` (client→server)
- `pong` (client→server) or server-initiated `ping` (server→client)

Gameplay relay

- `input` (client→server): { turnId, kind: 'bid'|'play'|'pass'|..., data }
- `event` (host→server; server→clients): { event: KnownAppEvent } — authoritative stream in Phase 1
- `private` (host→server): { to: playerId, kind: 'hand'|'prompt'|..., data } (server relays to target only)
- `hash` (client→server): { turnId, hash } — optional for desync detection
- `snapshot_request` (client→server): { sinceSeq }
- `snapshot` (client→server; relayed): { baseSeq, bundle: ExportBundle }

## Server Responsibilities

- Validate room capacity and basic input shape; reject unknown `type`.
- Assign `seq` and broadcast in room order. Guarantee per-room FIFO.
- Maintain `roster` and emit on joins/leaves/host changes.
- Enforce simple rate limits (per-connection and per-room) to prevent flooding.
- Enforce host-only actions (`start`, authoring `event`, `private`) in Phase 1.
- Route `private` messages only to the specified `playerId`.
- Drop messages for unknown rooms or when the sender is not in the room.

## Error Handling

- On invalid room or full: send `error{ code: 'room_not_found'|'room_full', message }` then optionally close.
- On version mismatch: `error{ code: 'version_mismatch', required, got }`.
- On unauthorized host action: `error{ code: 'not_host' }`.
- On rate limit: `error{ code: 'rate_limited' }` with retry hint.

## Reconnect and Resync

- Client reconnects, sends `join{ roomId, playerId }` to reclaim identity.
- Server resumes presence and emits `roster`.
- Client requests a peer `snapshot` and then streams subsequent `event` messages from `baseSeq+1`.
- Optionally, server can cache recent `event` messages in memory to accelerate catch-up (still stateless across restarts).

## Timeouts and Defaults (Policy Hooks)

- Heartbeat timeout: mark `connected=false` after ~10–20s without `pong`.
- Active-turn timeout: server notifies host after X seconds; host emits a deterministic default action at a defined `turnId`.
- Player drop: after N missed turns/heartbeats, server may emit a `roster` with `connected=false`; the host can issue `player/dropped` events.

## Security Considerations

- Authentication: optional room-level secret or short-lived join tokens; keep UX simple for casual play.
- Authorization: only host can emit authoritative `event` in Phase 1; server enforces.
- Input validation: schema-check payloads; clamp sizes; reject unexpected fields.
- Privacy: avoid logging payloads containing private info; redact or hash as needed.
- CORS/Origin checks if deployed behind HTTP upgrade endpoints.

## Deployment Notes

- Single instance is fine for small games; can run as a Node server or Worker (e.g., Cloudflare Workers with Durable Objects if you later need room stickiness).
- If horizontally scaling, ensure room stickiness (by `roomId`) so `seq` is monotonic per room, or centralize ordering.

## Minimal Pseudocode (sketch)

````ts
TypeScript shape (in-memory)
```ts
type ConnId = string;
type PlayerId = string;

type Client = {
  connId: ConnId;
  playerId: PlayerId;
  name: string;
  connected: boolean;
};

type Room = {
  roomId: string;
  hostId: PlayerId | null;
  seq: number;
  clients: Map<ConnId, Client>;
  createdAt: number;
  lastHostSeenAt: number;
};
````

ws.on('connection', (socket) => {
let connId = makeConnId();
let room: Room | null = null;
let playerId: string | null = null;

socket.on('message', (raw) => {
const msg = JSON.parse(String(raw));
switch (msg.type) {
case 'join': {
const { roomId, name } = msg.payload;
room = getOrCreateRoom(roomId);
playerId = msg.payload.playerId || makePlayerId();
const client: Client = { connId, playerId, name, connected: true };
room.clients.set(connId, client);
if (!room.hostId) room.hostId = playerId;
broadcast(room, { type: 'roster', payload: asRoster(room) });
break;
}
case 'input': {
if (!room) break;
relayToHost(room, msg); // host-only
break;
}
case 'event': {
if (!room) break;
if (playerId !== room.hostId) return sendError(socket, 'not_host');
room.seq += 1;
broadcast(room, { ...msg, seq: room.seq });
break;
}
case 'snapshot_request': {
if (!room) break;
relayToHost(room, msg);
break;
}
case 'private': {
if (!room) break;
relayToTarget(room, msg.payload.to, msg);
break;
}
}
});

socket.on('close', () => {
if (!room) return;
const c = room.clients.get(connId);
if (c) c.connected = false;
if (playerId === room.hostId) room.lastHostSeenAt = Date.now();
broadcast(room, { type: 'roster', payload: asRoster(room) });
});
});

```

---

This API keeps the relay thin, deterministic, and stateless. Clients remain the source of truth by persisting and reducing the ordered event stream.
```
