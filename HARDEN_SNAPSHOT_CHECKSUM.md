# Harden Snapshot Checksum

## Context
- Current snapshot dedupe uses a custom 53-bit FNV-style hash in `lib/state/persistence/sp-snapshot.ts`.
- Collision risk is low but non-zero; the function is not suitable for multiplayer integrity or tamper detection.
- We want a path that strengthens single-player persistence today and lays groundwork for multiplayer message verification.

## Objectives
1. Replace the weak checksum with a cryptographically strong digest.
2. Preserve deterministic behaviour for dedupe (no unnecessary writes) while reducing collision risk.
3. Allow future multiplayer code to reuse the same digest routine and extend it with authentication (HMAC/signatures).
4. Maintain compatibility with existing stored snapshots (graceful migration).

## Proposed Approach
- **Adopt SHA-256 digest** using a lightweight, audited library such as `@noble/hashes` (already tree-shakable and browser-friendly).
- **Return a string/byte digest** rather than truncating to a number. A hex string works well for comparisons and storage.
- **Centralize hashing** in a new helper (`computeSnapshotDigest`) that accepts the canonical serialized payload so multiplayer can reuse it.
- **Keep fingerprinting logic** (`fingerprintSnapshot`) untouched so old/new hashes are comparable off the same input.

### Shared Crypto Primitives
- Reuse the same digest helper for the hardened message protocol (see `HARDEN_MESSAGE_PROTOCOL.md`) so snapshot persistence and multiplayer messages share a single SHA-256 implementation.
- Host the helper in a neutral module (e.g., `lib/crypto/digest.ts`) to avoid persistence-specific imports from protocol code.
- Coordinate upgrades (e.g., switching algorithms or adding HMAC wrappers) across both plans to keep behavior aligned.

## Detailed Steps
1. **Install dependency**: add `@noble/hashes` to `dependencies` (or verify it already exists).
2. **Implement helper** (`lib/state/persistence/snapshot-digest.ts`):
   - Export `computeSnapshotDigest(serialized: string): string`.
   - Use SHA-256 to hash UTF-8 bytes of the serialized string, returning a lowercase hex string.
3. **Update current checksum usage** (`lib/state/persistence/sp-snapshot.ts`):
   - Replace imports/logic to use `computeSnapshotDigest`.
   - Update dedupe cache to store the hex string instead of a number.
   - Rename variables from `checksum` to `digest` where appropriate for clarity.
4. **Handle legacy cache values**:
   - If the cache is persisted anywhere, add logic to accept both number (old) and string (new) until users cycle through.
   - For in-memory cache only, ensure initial state resets to `null` so no special handling is needed.
5. **Update adapters**:
   - Verify any adapters (`indexedDb`, `localStorage`) that persist `checksum` fields— update schema/keys if needed.
   - Provide migration logic if stored snapshots contain the old numeric checksum (e.g., detect type and recompute on read).
6. **Testing**:
   - Add unit tests for `computeSnapshotDigest` to ensure stable output for known inputs.
   - Add regression test ensuring two distinct payloads produce different digests.
   - Update any existing tests or fixtures expecting numeric checksum values.
7. **Documentation & follow-up**:
   - Document the change in `HARDEN_MESSAGE_PROTOCOL.md` or a multiplayer design document, noting digest reuse.
   - Outline future multiplayer steps: wrap digest with HMAC for shared-secret modes or signatures for key-based verification.

## Open Questions
- Do we need to support verifying legacy persisted snapshots that only store the numeric checksum? (Investigate actual persistence shape.)
- Should we expose the digest through APIs/telemetry, and does that raise privacy concerns?
- Are there other areas of the codebase generating hashes/fingerprints that should unify on this helper?

## Future Extensions (Multiplayer Alignment)
- Introduce a message envelope format (`payload`, `digest`, `signature`/`mac`, `publicKeyId`).
- Manage per-player key material (probably via WebCrypto) and secure storage.
- Add replay protection (nonces/timestamps) alongside the digest.
- Consider protocol versioning so clients can negotiate hash/crypto algorithms.
