# Multiplayer Mode — El Dorado

This plan adds an online multiplayer mode that lets multiple devices play a full game together while keeping the server stateless with respect to long‑term game state. The server only relays and orders inputs; clients hold and persist the state locally (IndexedDB), just as in single‑player.

Guiding principles

- Keep scoring rules and round flow identical to the current app (see README.md Current Game/Rules) and the single‑player engine (see SINGLE_PLAYER.md).
- Reuse the existing event log reducer (`lib/state/types.ts` + `reduce`) so multiplayer becomes “network‑replicated events” rather than a new state system.
- Keep the server stateless/durable‑less: no database; maintain only ephemeral room connections and a per‑room monotonic sequence in memory.

## Goals

- Online play with 2–10 human players from separate devices.
- Server acts as an input relay/referee (orders inputs, rebroadcasts) with no durable storage.
- Deterministic, identical state on all clients derived from the same ordered event stream.
- Late join and dropped player rules mirror the app’s existing behavior (see docs/LATE_AND_DROPPED_PLAYERS.md).
- Resume/rejoin: a client can reconnect and catch up from peers without the server storing snapshots.

## Lobby

See MULTIPLAYER_LOBBY.md for the full lobby UX, routing, and message details (create/join flows, roster, edge cases, and heartbeats). This document focuses on gameplay replication and server responsibilities.

## Architecture

Two implementation phases are proposed. Phase 1 is simpler and gets a working system quickly; Phase 2 improves trust and desync handling.

Phase 1 — Host‑Authoritative Client (recommended start)

- One client (the host) runs the single‑player engine and emits authoritative game events (`sp/*` and existing scorekeeper events).
- The server (WebSocket relay) assigns sequence numbers and broadcasts these events to all room members.
- All clients apply the exact same ordered events through the existing reducer and persist them locally.
- Hidden information is supported because only the host needs to know the full deck; the host privately sends each player their hand via direct messages. Other clients trust the host’s emitted events for legality and trick results.

Phase 2 — Deterministic Lockstep (optional upgrade)

- All clients run the same engine with the same seed and full state; the server only orders inputs per turn/trick.
- Pros: less trust in a single host; better anti‑cheat.
- Cons: handling hidden information without a trusted server requires commit‑reveal (“mental poker”) or disclosing full state to all clients. This adds complexity and is not necessary for an initial release.

Server (stateless relay)

See MULTIPLAYER_SERVER.md for the full relay API: rooms/presence, message envelope, ordering with `seq`, heartbeats, error handling, and deployment notes. In brief, the server orders inputs and broadcasts them, maintains roster presence, and does not persist game state.

Client

- Persist the canonical event log in IndexedDB (existing stores).
- Apply ordered events via `reduce` (reuse `sp/*` events and scorekeeper events like `bid/set`, `made/set`, `round/finalize`).
- For host: run the engine, produce events; for peers: accept events and render UI, send inputs for your seat.
- Use BroadcastChannel/storage events for same‑tab sync (already implemented) and WebSocket for cross‑device sync.
  See MULTIPLAYER_LOBBY.md for lobby routes.

## Message Schema (sketch)

Envelope (server → clients and clients → server)

See MULTIPLAYER_SERVER.md for complete envelope and transport details. Gameplay-relevant message types used here:
- `event` (host→server; server→clients): authoritative state changes
- `input` (client→server): player intents (forwarded to host in Phase 1)
- `private` (host→server→client): per-player hand/prompt data
- `hash`, `snapshot_request`, `snapshot`: desync detection and resync

Key messages

- `event` (host→server; server→clients): { event: KnownAppEvent } — the authoritative stream in Phase 1
- `input` (client→server): { turnId, kind: 'bid'|'play'|'pass'|..., data } — forwarded to host in Phase 1
- `private` (host→server): { to: playerId, kind: 'hand'|'prompt'|..., data }
- `hash` (client→server): { turnId, hash } — state hash to detect desyncs
- `snapshot_request` (client→server): { sinceSeq }
- `snapshot` (client→server via server relay): { baseSeq, bundle: ExportBundle } — provided by a peer/host

Notes

- `KnownAppEvent` already includes `eventId` and `ts`. The server adds `seq` to establish a total order.
- For Phase 2 (lockstep), replace `event` with `input` + server‑ordered `TickBundle` and let all clients run the engine locally.

## Game Flow (Phase 1)

Lobby

See MULTIPLAYER_LOBBY.md.

Start

- Host sends `start` with `seed` and seating order.
- Host runs the engine’s deal using `seed`, then emits:
  - `sp/deal` + `sp/phase-set` events (broadcast)
  - Per‑player `private{kind:'hand'}` messages to deliver hands

Bidding

- Current bidder’s client submits `input{kind:'bid'}` → server → host.
- Host validates and emits `events.bidSet` and advances when all bids present.

Play/tricks

- The client whose turn it is submits `input{kind:'play', card}`.
- Host validates against engine rules and emits `sp/trick/played`; on trick end emits `sp/trick/cleared`, `sp/leader-set`.
- When the round finishes, host compares tricks‑won to bids and emits `events.madeSet` per player, then `events.round/finalize` to apply scoring (existing reducer logic).

Late join / drop

- Mirror docs/LATE_AND_DROPPED_PLAYERS.md:
  - `player/dropped{ id, fromRound }` at a deterministic boundary.
  - `player/resumed{ id, fromRound }` to re‑add.
  - UI disables bid/complete inputs for absent rounds.

Rejoin / resync

- Any client can request `snapshot_request{ sinceSeq }` from server; server forwards to host or any healthy peer.
- A peer responds with `snapshot{ baseSeq, bundle }` built via `exportBundle(dbName)`; the rejoining client imports via `importBundleSoft` and then streams new `event` messages from `baseSeq+1`.
- Periodic `hash{ turnId, hash }` can be used for early desync detection.

Disconnects and timeouts

- Heartbeats: server expects a ping every N seconds; after M missed beats, mark disconnected and broadcast `roster`.
- Active turn timeout: for bidding/plays, if the active player is disconnected or times out, host commits a deterministic default (e.g., PASS / auto‑discard first legal). Apply at a specific `turnId` so all clients agree. Defaults should match SINGLE_PLAYER.md assumptions where applicable.

## Integration Points

- Events: Reuse existing event creators in `lib/state/events.ts`:
  - Scoring flow: `bid/set`, `made/set`, `round/state-set`, `round/finalize`.
  - Single‑player engine events: `sp/*` to drive dealing, phases, plays, leaders, and trump.
  - Multiplayer will replicate these `KnownAppEvent` objects over the network; reducers remain unchanged.
- Storage: Clients persist the ordered event log and current state in IndexedDB via existing code in `lib/state/io.ts`.
- UI:
  - Add multiplayer lobby and in‑room lobby views (see MULTIPLAYER_LOBBY.md); in‑game view starts after host presses Start.
  - Render largely the same “Current Game” and “Rounds” views, with turn prompts and play controls when it’s your turn.
  - Use existing Players and Games views where possible; add room/seat affordances.

## Security & Fair Play

- Phase 1 relies on a trusted host for move legality and hidden information (hands). This matches casual play expectations and simplifies delivery.
- Basic anti‑cheat: server can require inputs to be timely and ordered, and the host can attach proofs (e.g., seed + deck permutation hash) revealed at round end to audit deal integrity.
- Phase 2 (lockstep) or a server‑side dealer (ephemeral, not persisted) can further reduce trust in the host at the cost of complexity.

## Testing Plan

- Unit tests:
  - Serialization/ordering: server attaches `seq` and preserves per‑room order.
  - Reducer idempotency when applying replicated `KnownAppEvent`s.
  - Rejoin path: export/import bundle and catch‑up from `seq`.
  - Late/dropped flows reproduce docs/LATE_AND_DROPPED_PLAYERS.md expectations over the network.
- Integration tests (node env):
  - Two‑client simulation with a mock relay: bids → plays → finalize yields identical state hashes.
  - Disconnect/timeout commits default actions deterministically.

## Phased Delivery

1. Minimal relay server

- WebSocket relay with rooms, sequence numbers, roster broadcast, heartbeats.
- No persistence. Small Node server or Worker.

2. Client networking layer

- Room lifecycle (create/join/leave), host designation, heartbeats.
- Map incoming `event` messages to `reduce` and persist.
- Wire snapshot import/export for resync.

3. Host‑authoritative gameplay

- Host uses `lib/single-player/*` to run rounds, validate moves, and emit `sp/*` + scorekeeper events.
- Implement bidding/playing UIs gated by turn ownership.

4. UX polish + rules parity

- Timers, prompts, private hand delivery, spectator mode for dropped players.
- Visual indicators for disconnects and turn ownership.

5. Optional: Trust upgrades

- Deal integrity proofs or server‑dealt hands (ephemeral only).
- Lockstep/rollback netcode if needed.

## Open Questions (choose defaults now)

- Hidden information: Start with host‑authoritative hands; no commit‑reveal in v1.
- Defaults on timeout: PASS for bidding; first legal card for play; treat as `player/dropped` after N timeouts.
- Spectators: allow reconnect as spectator after drop; not counted in turn order.
- Room size limits: 2–10, matching SINGLE_PLAYER.md engine limits.

## Non‑Goals (initial release)

- Server‑persisted game history or reconnection without peer snapshots.
- Cross‑room migrations or long‑term analytics beyond what already exists.
- Strong anti‑cheat; this is a casual play feature in v1.

---

This plan keeps the current scoring model and reducer unchanged, adds a thin network replication layer, and introduces a small relay server. Phase 1 delivers a practical, easy‑to‑ship mode; Phase 2 leaves room for stronger trust and determinism if needed.
