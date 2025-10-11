# Harden Message Protocol Plan

## Goals

- Protect same-origin coordination messages from eavesdropping, spoofing, or cross-app interference.
- Establish a payload contract that can extend to cross-host multiplayer transports.
- Minimize disruption to existing single-player signaling while enabling incremental rollout.

## Guiding Principles

- **Scoped channels**: Namespace identifiers with app- and session-specific values so other scripts cannot accidentally subscribe or publish.
- **Authenticated payloads**: Require each message to carry an integrity proof (signature or MAC) that is validated before acting on it.
- **Transport-agnostic contract**: Treat localStorage, BroadcastChannel, and future WebSocket/WebRTC transports as interchangeable carriers of the same envelope.
- **Backward compatibility**: Provide a migration path that keeps the current signal consumers working until they adopt the hardened contract.

### Shared Crypto Primitives

- Depend on the SHA-256 digest helper introduced in `HARDEN_SNAPSHOT_CHECKSUM.md` so all message signing/verifying logic shares the same implementation.
- Keep crypto utilities in a neutral location (e.g., `lib/crypto/digest.ts`, `lib/crypto/signature.ts`) to avoid circular dependencies with persistence code.
- Coordinate future algorithm changes or key-derivation updates with the snapshot plan to maintain end-to-end consistency.

## Implementation Phases

### Phase 1 – Protocol Definition

1. Design a `GamesSignalEnvelope` type:
   - Fields: `version`, `appId`, `channel`, `nonce`, `payload`, `signature`.
   - `payload` wraps the existing `GamesSignal` body (`type`, `gameId`, `timestamp`).
   - `channel` includes tab/session context (e.g., `appId:gameId`).
2. Determine signing strategy:
   - Generate a per-app HMAC secret on the server (delivered via bootstrap API or inline script).
   - For local/dev fallback, derive a deterministic secret from an env var.
3. Create helper utilities:
   - `createEnvelope(payload, context)`
   - `verifyEnvelope(envelope)`
   - `encodeEnvelope` / `decodeEnvelope` for serialization.

### Phase 2 – Scoped Channel Usage

1. Replace static constants:
   - Compute `GAMES_SIGNAL_STORAGE_KEY` and `GAMES_SIGNAL_CHANNEL` as `${appId}:games:signal` and `${appId}:games:${gameId}`.
   - `appId` originates from server config; `gameId` optional for tab-global messaging.
2. Update `emitGamesSignal` to:
   - Resolve app/session identifiers.
   - Create and sign an envelope before persisting/posting.
3. Update `subscribeToGamesSignal` to:
   - Verify envelopes before invoking handlers.
   - Ignore legacy messages unless `includeLegacy` opt-in is provided (for transition).

### Phase 3 – Migration Support

1. Feature flag the hardened protocol (e.g., `NEXT_PUBLIC_SIGNAL_PROTOCOL=v2`).
2. When enabled:
   - Emit both legacy and v2 messages during rollout.
   - Subscribe first to v2; fall back to legacy until all consumers migrate.
3. Add telemetry/logging for rejected envelopes (invalid signature, wrong appId) to surface misuse.

### Phase 4 – Multiplayer Preparation

1. Extract transport-agnostic interface: `SignalTransport` with `publish(envelope)` / `subscribe(handler)`.
2. Implement adapters:
   - `LocalStorageTransport`
   - `BroadcastChannelTransport`
   - Stub `RealtimeTransport` (WebSocket/WebRTC) using same envelope verification.
3. Ensure server/broker components validate `appId` and signature, preventing cross-host spoofing.

## Testing Strategy

- Unit tests for envelope creation/verification (happy path, tampering, stale nonce).
- Integration tests that simulate legacy + v2 coexistence within the same tab and across tabs.
- Security regression tests that attempt to replay or forge messages.
- Manual verification checklist for enabling the feature flag in staging.

## Rollout Considerations

- Document required env vars/secrets (`NEXT_PUBLIC_APP_ID`, `NEXT_PUBLIC_SIGNAL_SECRET`).
- Communicate migration timeline to teams relying on legacy signals.
- Monitor logging for rejected envelopes after rollout to detect unexpected publishers.
