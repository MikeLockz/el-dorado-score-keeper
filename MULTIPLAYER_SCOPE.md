# Multiplayer Scope — El Dorado (MVP)

This document refines the MVP scope with clear roles, start gates, and acceptance criteria.

## Roles and Responsibilities

- Host
  - Emits authoritative public events (`event` with `KnownAppEvent`).
  - Controls Start and overall pacing.
  - May or may not be the dealer in a given round.
- Dealer
  - Originates the deal for that round and privately delivers hands to players.
  - Rotates per round as defined by game rules (see SINGLE_PLAYER.md).
  - When dealer ≠ host, the dealer still sends `private{kind:'hand'}` messages while the host continues to emit public `event`s.
- Non‑host players
  - Send `input{kind:'bid'|'play'|...}` on their turns; apply ordered `event`s locally.

## Start Gate (exact conditions)

- Minimum players: 2.
- All players have a non‑empty display name (2–20 chars, trimmed).
- Seat order locked: use the lobby roster order as initial seat order unless a seat picker UI is added later.
- Single active host: the first joiner; no host reassignment in MVP.
- When conditions are met, the host sees Start enabled and can press it to begin.

## Dealer Rotation (signal)

- For each round, emit a public event that identifies the dealer and seating order used for the deal:
  - `sp/deal` payload includes `dealerId`, `order`, `roundNo`, `trump`, `trumpCard` (see existing types), and `hands` for local rendering.
  - Private hand messages are sent by the dealer to each player with their cards.

## Acceptance Criteria (Happy Path)

1) Player A opens lobby, creates room → becomes host. Player B joins via link.
2) Both see the roster with names; Start is enabled for host.
3) Host presses Start; both navigate to game view; dealer (per rotation) DMs hands; host emits `sp/deal` and moves to bidding.
4) Player B bids: sends `input{kind:'bid'}` → host validates → host broadcasts `event{bid/set}` → both UIs update identically.
5) Trick play: current player sends `input{kind:'play'}`; host validates and emits `sp/trick/played` and `sp/trick/cleared` as tricks resolve.
6) Round end: host emits `made/set` per player and `round/finalize`; totals update identically on both clients.
7) Game proceeds to next round with dealer rotated accordingly.

## Acceptance Criteria (Disconnects & Rejoin)

- If a non‑host refreshes mid‑game: client auto‑reconnects, rejoins the room with same `playerId`, requests `snapshot`; on receipt, imports and catches up; otherwise falls back to lobby with a friendly message.
- If host disconnects mid‑game: all clients show “Waiting for host…”; inputs are blocked; if host returns within TTL, game resumes; otherwise room expires.

