# Multiplayer Versioning & Flags — El Dorado

This document defines minimal version negotiation and feature gating for MVP.

## Versions

- `clientVersion`: semantic string sent in `join` (e.g., `1.0.0`).
- `rulesVersion`: optional string in `start` describing rule set; defaults to current rules.

## Policy

- For MVP, accept any `clientVersion` but include it in `roster` for debug.
- Optionally hard-block on known-bad versions by a simple allowlist (server-side constant).

## Feature Flags (future)

- Introduce a `features` array in `start` to signal optional capabilities (e.g., `['resync','spectators']`).
- Clients ignore unknown features by default.

