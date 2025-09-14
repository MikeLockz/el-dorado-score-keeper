# Multiplayer Protocol — El Dorado

This document specifies message schemas, sequencing, turn identifiers, and examples for the multiplayer relay.

## Envelope

- Common fields for all messages:
  - `roomId`: string
  - `seq`: number | null (server fills for ordered broadcasts; null for client→server inputs)
  - `type`: string (see catalog)
  - `payload`: object
  - `ts`: number (ms since epoch; server may stamp or pass-through)

## TypeScript Types (MVP)

```ts
// Envelope shared by all messages
export interface Msg<TType extends string = string, TPayload = unknown> {
  roomId: string;
  type: TType;
  payload: TPayload;
  seq?: number | null; // present on server→client broadcasts
  ts?: number; // server may stamp
}

// Lobby/control
export interface JoinPayload {
  roomId: string;
  name: string;
  playerId?: string;
  clientVersion?: string;
}
export type JoinMsg = Msg<'join', JoinPayload>;

export interface RosterPayload {
  roomId: string;
  players: Array<{ id: string; name: string; connected: boolean }>;
  hostId: string;
  maxPlayers?: number;
}
export type RosterMsg = Msg<'roster', RosterPayload>;

export interface StartPayload {
  roomId: string;
  seed: string;
  order: string[];
  rulesVersion?: string;
}
export type StartMsg = Msg<'start', StartPayload>;

export interface LeavePayload {
  roomId: string;
}
export type LeaveMsg = Msg<'leave', LeavePayload>;

// Gameplay
export interface InputPayload {
  roomId: string;
  turnId: string; // e.g., "3:bidding:2" or "3:play:trick5:p2"
  kind: string; // 'bid' | 'play' | 'pass' | ...
  data: unknown;
}
export type InputMsg = Msg<'input', InputPayload>;

export interface EventPayload {
  roomId: string;
  event: KnownAppEvent;
}
export type EventMsg = Msg<'event', EventPayload>;

export interface PrivatePayload {
  roomId: string;
  to: string;
  kind: string;
  data: unknown;
}
export type PrivateMsg = Msg<'private', PrivatePayload>;

// Resync
export interface SnapshotRequestPayload {
  roomId: string;
  sinceSeq: number;
}
export type SnapshotRequestMsg = Msg<'snapshot_request', SnapshotRequestPayload>;

export interface SnapshotPayload {
  roomId: string;
  baseSeq: number;
  bundle: ExportBundle;
}
export type SnapshotMsg = Msg<'snapshot', SnapshotPayload>;

// Health
export interface PongPayload {
  roomId: string;
  ts: number;
}
export type PingMsg = Msg<'ping', { roomId: string; ts: number }>;
export type PongMsg = Msg<'pong', PongPayload>;

// Discriminated union for runtime handling
export type WireMsg =
  | JoinMsg
  | RosterMsg
  | StartMsg
  | LeaveMsg
  | InputMsg
  | EventMsg
  | PrivateMsg
  | SnapshotRequestMsg
  | SnapshotMsg
  | PingMsg
  | PongMsg;
```

## Catalog and Schemas

Lobby/control (see also MULTIPLAYER_LOBBY.md)

- `join` c→s
  - `{ roomId: string, name: string, playerId?: string, clientVersion?: string }`
- `roster` s→c
  - `{ roomId: string, players: Array<{ id: string, name: string, connected: boolean }>, hostId: string, maxPlayers?: number }`
- `start` host c→s
  - `{ roomId: string, seed: string, order: string[], rulesVersion?: string }`
- `leave` c→s
  - `{ roomId: string }`

Gameplay

- `input` c→s
  - `{ roomId: string, turnId: string, kind: 'bid'|'play'|'pass'|'made'|string, data: unknown }`
  - Relay to host only.
- `event` host c→s, s→c (broadcast)
  - `{ roomId: string, event: KnownAppEvent }`
  - Server stamps `seq` and forwards.
- `private` dealer/host c→s, s→c (targeted)
  - `{ roomId: string, to: string, kind: 'hand'|'prompt'|string, data: unknown }`
  - Server relays only to `to`.

Resync

- `snapshot_request` c→s
  - `{ roomId: string, sinceSeq: number }`
- `snapshot` donor c→s, s→c
  - `{ roomId: string, baseSeq: number, bundle: ExportBundle }`

Optional health

- `ping` s→c or c→s, `pong` c→s
  - `{ roomId: string, ts: number }`

## Sequencing

- Server assigns `seq = ++room.seq` on all broadcast messages that affect shared state (`event`, `roster`, `start`).
- Clients must process broadcasts in ascending `seq`. If a gap is detected, clients should buffer out-of-order messages briefly; if not filled, request resync.
- Duplicate `seq` should be ignored (idempotent application); `KnownAppEvent.eventId` also guards against reapplication.
- Recommended buffering: 250–500ms for minor reordering before triggering a `snapshot_request`.

## Turn Identifiers

- `turnId` is a stable string that uniquely identifies a decision point:
  - Format: `<roundNo>:<phase>:<index>` (examples: `3:bidding:2`, `3:play:trick5:p2`).
  - The host validates that an incoming `input.turnId` matches the current expected turn; otherwise ignore or reply with an error.

## Examples

## Message Rejections (Host and Server)

When a message cannot be accepted, an `error` message is sent. The sender should surface the error and drop/retry as appropriate.

Server‑side rejections

- `not_host`: non‑host attempted to send `event` or `start`.
- `room_not_found`, `room_full`, `version_mismatch`, `rate_limited` (see MULTIPLAYER_ERRORS.md).

Host‑side rejections (for `input`)

- `wrong_turn`: `turnId` does not match the expected turn.
- `illegal_move`: e.g., card not in hand or violation of follow suit rule.
- `stale_input`: input references an already resolved decision.
- `unknown_kind`: unrecognized `kind`.

Example errors

```json
{ "type": "error", "payload": { "code": "wrong_turn", "message": "Expected 3:bidding:2" } }
{ "type": "error", "payload": { "code": "illegal_move", "message": "Must follow hearts" } }
{ "type": "error", "payload": { "code": "not_host" } }
```

## State Hashing (Optional, Recommended)

Purpose

- Detect desyncs early by comparing per‑round or per‑milestone hashes across clients.

What to hash

- A minimal, deterministic projection of state that should be identical across clients:
  - Players and order
  - Rounds map: for each round → bids, made flags, round state
  - Totals per player
- Exclude volatile/ephemeral fields: timestamps, `seq`, connection state, local UI, and transient single‑player runtime (e.g., `sp.hands`, `sp.trickPlays`).

Canonical JSON recipe

1. Build a plain JS object containing only the fields above.
2. Sort object keys lexicographically at every level (stable stringify).
3. Represent numbers as decimal without locale; booleans as `true/false`; strings UTF‑8.
4. Serialize to UTF‑8 and compute a hash (e.g., SHA‑256) and hex‑encode the result.

Pseudo‑TypeScript

```ts
type Hashable = string | number | boolean | null | Hashable[] | { [k: string]: Hashable };

function stableStringify(x: Hashable): string {
  if (x === null) return 'null';
  if (typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(stableStringify).join(',') + ']';
  const keys = Object.keys(x).sort();
  return (
    '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify((x as any)[k])).join(',') + '}'
  );
}

function projectStateForHash(state: AppState) {
  const players = state.display_order
    ? Object.entries(state.display_order)
        .sort((a, b) => a[1] - b[1])
        .map(([id]) => ({ id, name: state.players[id] }))
    : Object.keys(state.players)
        .sort()
        .map((id) => ({ id, name: state.players[id] }));
  const rounds = Object.fromEntries(
    Object.entries(state.rounds).map(([r, data]) => [
      r,
      {
        state: data.state,
        bids: data.bids,
        made: data.made,
      },
    ]),
  );
  return { players, rounds, scores: state.scores } as const;
}

function stateHash(state: AppState): string {
  const s = stableStringify(projectStateForHash(state));
  return sha256Hex(s); // use a standard SHA-256 implementation
}
```

Usage

- Emit `hash` messages at round end or every N events: `{ turnId, hash }`.
- If any client detects a mismatch from peers, prompt the affected client to resync via snapshot.

1. Join

```
{ "roomId": "k3c7tq9h", "type": "join", "payload": { "name": "Alex", "playerId": "p_abc123" } }
```

2. Roster (broadcast)

```
{ "roomId": "k3c7tq9h", "seq": 1, "type": "roster", "payload": { "players": [{"id":"p_abc123","name":"Alex","connected":true},{"id":"p_def456","name":"Bea","connected":true}], "hostId": "p_abc123" } }
```

3. Input (bid)

```
{ "roomId": "k3c7tq9h", "type": "input", "payload": { "turnId": "1:bidding:2", "kind": "bid", "data": { "bid": 3 } } }
```

4. Event (authoritative bid/set)

```
{ "roomId": "k3c7tq9h", "seq": 42, "type": "event", "payload": { "event": { "eventId":"e1","type":"bid/set","payload":{"round":1,"playerId":"p_def456","bid":3},"ts": 1730000000000 } } }
```

5. Private (dealer → player hand)

```
{ "roomId": "k3c7tq9h", "type": "private", "payload": { "to": "p_def456", "kind": "hand", "data": { "cards": [{"suit":"hearts","rank":12}, {"suit":"spades","rank":14}] } } }
```

6. Snapshot flow

```
// requester
{ "roomId": "k3c7tq9h", "type": "snapshot_request", "payload": { "sinceSeq": 40 } }
// donor → broadcast to requester (relayed)
{ "roomId": "k3c7tq9h", "type": "snapshot", "payload": { "baseSeq": 41, "bundle": { "latestSeq": 41, "events": [ /* ... */ ] } } }
```
