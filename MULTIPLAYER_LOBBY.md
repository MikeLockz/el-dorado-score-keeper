# Multiplayer Lobby — El Dorado

This document specifies the multiplayer lobby experience: creating a new game, joining by invite, in-room lobby behavior, edge cases, and message contracts. It is networking-agnostic and complements the core plan in MULTIPLAYER.md.

## Routing (no‑code spec)

- `/multiplayer` — lobby entry page with two panels: Create and Join.
- `/multiplayer/room/:roomId` — in‑room lobby showing share link, roster, and Start controls.
- On Start, transition to the multiplayer game view (same route can render different phase states: lobby → game).

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

