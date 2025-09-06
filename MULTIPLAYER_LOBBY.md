# Multiplayer Lobby — El Dorado

This document specifies the multiplayer lobby experience: creating a new game, joining by invite, in-room lobby behavior, edge cases, and message contracts. It is networking-agnostic and complements the core plan in MULTIPLAYER.md.

## Routing (no‑code spec)

- `/multiplayer` — lobby entry page with two panels: Create and Join.
- `/multiplayer/room/:roomId` — in‑room lobby showing share link, roster, and Start controls.
- On Start, transition to the multiplayer game view (same route can render different phase states: lobby → game).

## UI Wireframes (ASCII)

Create/Join

```
┌───────────────────────────────────────────────┐
│ Multiplayer Lobby                             │
│                                               │
│ [ Create New Game ]                           │
│                                               │
│ Join an existing game                         │
│ [ room ID or link            ] ( Join )       │
│                                               │
│ Rooms look like: https://host/multiplayer/room/<id> │
└───────────────────────────────────────────────┘
```

In-room Lobby

```
┌───────────────────────────────────────────────┐
│ Room: k3c7tq9h    ( Copy Link )               │
│                                               │
│ Players (host ★)                              │
│  • Alex ★   (connected)                       │
│  • Bea      (connected)                       │
│                                               │
│ [ Start Game ]  (host only, enabled when ≥2)  │
│ [ Leave ]                                      │
└───────────────────────────────────────────────┘
```

## User Flows

- Create: click Create → room page → copy/share link → wait for players → Start when ready.
- Join: paste ID/link → join room → set name if needed → wait for Start.
- Leave: return to /multiplayer; room remains if others stay.

## Validation Rules

- roomId: lowercase base36, 8–10 chars. Regex: `^[a-z0-9]{8,10}$`
- name: 2–20 visible chars, trim whitespace, allow letters/digits/space/basic punctuation.
- duplicate names: allowed; UI may append a local suffix for disambiguation.

## Lobby UX (Create/Join)

Overview

- A dedicated lobby view allows players to either create a new room or join an existing one via a shareable ID or link.
- No networking is implemented in this document; this section defines the UX, flows, and message contracts the relay/server would later satisfy.

Create New Game

- Action: “Create Game” generates a `roomId` — short, URL‑safe, human‑shareable.
- ID format: 8–10 lowercase base36 characters (e.g., `k3c7tq9h`).
- Share link: `https://<host>/multiplayer/room/<roomId>` (deep link pattern; exact base path may vary).
- Host assignment: the creator becomes the initial `hostId` (can be reassigned later).
- UI affordances: copy link button; optional QR code; room code shown prominently.

Join Existing Game

- Input accepts either the bare `roomId` or a full invite URL; client extracts the last path segment as the ID.
- On join, prompt for display name (pre‑fill from local preference if available).
- If display name duplicates, disambiguate in UI (append a number locally) while preserving the submitted name.
- Validation: reject empty IDs, invalid characters, or length outside expected bounds; show toast/error inline.

Lobby Screen (inside a room)

- Header shows `roomId` and share link; copy button.
- Roster list: players with `name`, `connected` status, and a host badge.
- Controls (host only): Start Game (enabled when ≥ 2 players), Assign Host, Kick/Drop.
- Controls (all): Leave room.
- Status: “Waiting for host to start”, “Starting…”, “Reconnecting…”.

Edge Cases & Errors

- Room not found: show clear retry + “Create New Game” option.
- Room full (≥10): surface error; allow “Create New Game”.
- Version mismatch: display an incompatibility message (clientVersion vs. hostVersion); block joining or suggest reload.
- Lost connection: keep lobby visible with reconnecting indicator; allow Copy Link while offline.

Persistence

- Remember last used display name and last joined room locally (for convenience only).
- Do not auto‑rejoin without explicit user intent if another session is already active with the same identity.

## Lobby Messages (sketch)

Envelope fields: `roomId`, `seq?`, `type`, `payload` (see MULTIPLAYER.md for envelope shape). Lobby-related message types:

- `join` (client→server): { roomId, playerId?, name, clientVersion }
- `roster` (server→clients): { roomId, players: [{id,name,connected}], hostId, maxPlayers }
- `start` (host→server): { roomId, seed, order, rulesVersion, options }
- `leave` (client→server)
- `pong`/heartbeats for presence; server derives `connected` from liveness.

Notes

- The first entrant becomes `hostId` by default; host can be reassigned.
- `start` should only be accepted from the current host and when roster size ≥ 2.
