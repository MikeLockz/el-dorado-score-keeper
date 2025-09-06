# Multiplayer Connections & Timeouts — El Dorado

This document defines presence, heartbeats, disconnect handling, and TTL policies.

## Heartbeats

- Interval: server sends `ping` every 5s (configurable) or expects client `pong` every 5s.
- Disconnect threshold: 15s without a `pong` → mark `connected=false` in roster.
- Roster update: broadcast a `roster` message when connection state changes.

## Host Disconnect

- MVP policy: pause game and wait for host.
- Room TTL while host away: 5–10 minutes (pick one; 8 minutes default) after last host `pong`.
- If host resumes within TTL: continue from last `seq`.
- If TTL expired: room is deleted; clients return to lobby.

## Client Reconnect

- Clients reconnect automatically with exponential backoff (500ms → 1s → 2s → 4s → 5s cap, jittered).
- On reconnect, attempt auto rejoin/resync (see MULTIPLAYER_RESYNC.md).

Backoff formula
- base = 500ms; attempt n uses delay = min(500ms * 2^(n-1), 5000ms) + jitter(±20%).

## Rate Limits (lightweight)

- Per-connection: max 20 messages/second burst, token-bucket refill 10/sec.
- Per-room: max 100 messages/second.
- On limit exceeded: send `error{ code: 'rate_limited' }` and drop excess.
