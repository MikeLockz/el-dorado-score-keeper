# Multiplayer Errors & UI Surfaces — El Dorado

This document standardizes minimal error codes and how to present them.

## Error Codes

- `room_not_found`: the roomId does not exist (or expired).
- `room_full`: room has reached capacity (10 players).
- `version_mismatch`: clientVersion incompatible with room/host.
- `not_host`: action requires host privileges.
- `rate_limited`: message rate exceeded.
- `timeout`: operation timed out (e.g., snapshot waiter).

## Surfaces

- Lobby join errors: inline message under join input, plus retry CTA; offer “Create New Game”.
- In-room errors: top banner/toast; do not interrupt unless fatal.
- Fatal room errors (expired, not found): route back to lobby with a clear explainer.

## Recovery CTAs

- Retry join
- Create new room
- Copy invite link (when available)

## Message Shape

```ts
export interface ErrorMsg {
  roomId?: string;
  type: 'error';
  payload: {
    code: 'room_not_found' | 'room_full' | 'version_mismatch' | 'not_host' | 'rate_limited' | 'timeout' | string;
    message?: string;
    info?: unknown;
  };
  seq?: number | null;
  ts?: number;
}
```
