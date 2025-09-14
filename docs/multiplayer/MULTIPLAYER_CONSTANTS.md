# Multiplayer Constants — El Dorado (MVP Defaults)

This file centralizes numeric/time constants and simple limits used across the multiplayer docs.

## Room & Players

- maxPlayers: 10
- roomId: lowercase base36, length 8–10, regex `^[a-z0-9]{8,10}$`
- name length: 2–20 (trimmed)

## Networking & Presence

- ping interval: 5s
- disconnect threshold: 15s without pong
- host pause TTL: 8 minutes after last host pong
- reconnect backoff: 500ms → 1s → 2s → 4s → 5s cap, ±20% jitter
- snapshot wait timeout: 5s
- broadcast gap buffer (client): 300ms (range 250–500ms acceptable)

## Rate Limits (soft)

- per-connection: 20 messages/second, token bucket refill 10/sec
- per-room: 100 messages/second

## Protocol

- minimal messages for MVP: join, roster, start, input, event, private, leave, ping/pong, snapshot_request, snapshot
