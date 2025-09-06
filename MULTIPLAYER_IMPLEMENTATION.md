# Multiplayer Implementation — Phased Plan (MVP First)

This plan breaks multiplayer into small, verifiable phases. Each phase ships behind a feature flag, has clear deliverables, and a validation checklist. Do not proceed to the next phase until all acceptance criteria pass locally (two browsers) and in automated tests where applicable.

Related design docs
- MULTIPLAYER.md — overview and MVP scope
- MULTIPLAYER_SCOPE.md — roles, start gate, acceptance criteria
- MULTIPLAYER_LOBBY.md — lobby UX/routes/messages
- MULTIPLAYER_SERVER.md — stateless relay API and pseudocode
- MULTIPLAYER_PROTOCOL.md — wire schemas, sequencing, hashing
- MULTIPLAYER_DEALER.md — dealer & hidden info
- MULTIPLAYER_RESYNC.md — auto rejoin/resync
- MULTIPLAYER_CONNECTIONS.md — heartbeats, TTLs, rate limits
- MULTIPLAYER_STORAGE.md — local keys and isolation
- MULTIPLAYER_ERRORS.md — error codes
- MULTIPLAYER_VERSIONING.md — version policy
- MULTIPLAYER_TESTING.md — E2E and chaos tests
- MULTIPLAYER_CONSTANTS.md — numeric defaults

## Phase 0 — Prep & Feature Flag

Deliverables
- Env/config flag to enable multiplayer UI (e.g., `NEXT_PUBLIC_MP_ENABLED=true`).
- Constants file with MVP defaults (see MULTIPLAYER_CONSTANTS.md).
- TypeScript wire types (import/align from MULTIPLAYER_PROTOCOL.md).

Validation
- App builds with flag on/off; no runtime errors.
- Types compile and are imported where stubs will use them.

Acceptance
- Toggle hides/shows the Multiplayer entry point.

## Phase 1 — Minimal Relay Server (Local Mock)

Deliverables
- WS endpoint with in-memory rooms `{ roomId → { clients, hostId, seq } }`.
- Implement join/roster/start/input/event/private/leave/ping/pong (relay only).
- Monotonic `seq` on broadcasts; no persistence.

Validation
- Unit: sequence increments; roster reflects join/leave; non-host cannot send `event`.
- Integration (node): two WS clients exchange `roster`, `event` with increasing `seq`.

Acceptance
- Relay runs locally and passes tests; logs minimal diagnostics.

## Phase 2 — Lobby UI (Offline)

Deliverables
- `/multiplayer` create/join screen (ID validation, copy link).
- `/multiplayer/room/:roomId` in-room lobby shell (roster placeholder, Start disabled).

Validation
- UI constraints: roomId regex, name constraints; navigation flows.
- Accessibility pass for buttons/inputs.

Acceptance
- Smooth UX without server; no console errors.

## Phase 3 — Lobby Wired to Relay

Deliverables
- Connect WS; send `join`; render live `roster`; first joiner marked host.
- Start enabled for host when ≥ 2 players and names valid.

Validation
- Two browsers can see each other; host badge correct; Start gating works.
- Error surfaces: room not found/full (fake server codes), show inline.

Acceptance
- Basic lobby loop is reliable across refreshes (still no game start).

## Phase 4 — Start & Deal Skeleton

Deliverables
- Host sends `start{ seed, order }` and triggers game view.
- Broadcast `sp/deal` with `roundNo`, `dealerId`, `order`, trump fields (hands can be placeholder for now).

Validation
- Both clients transition from lobby to game view upon Start.
- `sp/deal` appears with consistent payloads on both clients.

Acceptance
- Start reliably transitions, dealer indicated per rotation plan.

## Phase 5 — Dealer Private Hand Delivery

Deliverables
- Dealer (may be host or not) sends `private{kind:'hand', to, data: { cards[] } }` to each player.
- Non-target clients do not receive hand data.

Validation
- Two browsers: confirm only the intended recipient sees “You have N cards”.
- No public event reveals hands.

Acceptance
- Hand delivery is private and timely (immediately after `sp/deal`).

## Phase 6 — Bidding Flow

Deliverables
- Non-host sends `input{kind:'bid', turnId, data}`; host validates and broadcasts `event{bid/set}`.
- Turn advancement through all seats; UI reflects bids.

Validation
- Wrong turn → `error{wrong_turn}`; illegal value clamped/rejected per rules.
- Two-client run: bids propagate identically; reducer totals unaffected yet.

Acceptance
- Full round bidding works across clients; errors surfaced appropriately.

## Phase 7 — Trick Play Flow

Deliverables
- Validate plays with existing single-player rules; emit `sp/trick/played`, `sp/trick/cleared`, `sp/leader-set`.
- Track trick winners; leader rotates.

Validation
- Out-of-turn → `error{wrong_turn}`; illegal follow → `error{illegal_move}`.
- Two-client run: trick winner identical; sequence of events consistent.

Acceptance
- At least one complete trick resolves consistently across clients.

## Phase 8 — Finalize Scoring Integration

Deliverables
- Emit `made/set` per player and `round/finalize`; totals update via existing reducer.

Validation
- Reducer totals match expectation for made/missed and bids.
- State hash (optional): identical after finalize on both clients.

Acceptance
- Round completes with correct totals.

## Phase 9 — Auto Rejoin/Resync

Deliverables
- Persist `playerId`, name, and last `seq`.
- Implement `snapshot_request`/`snapshot` (donor = host preferred) and `importBundleSoft`.

Validation
- Refresh non-host during bidding and during trick: auto rejoin/resync within 5s; otherwise fallback to lobby with message.

Acceptance
- Resync succeeds when host available; graceful fallback when not.

## Phase 10 — Host Disconnect Pause

Deliverables
- Heartbeats (ping/pong), roster connected=false on timeout.
- Paused state when host disconnects; resume if host returns within TTL.

Validation
- Disconnect host: other clients show “Waiting for host…”, inputs blocked; resume correctly.

Acceptance
- Pause/resume reliable; no stray inputs applied while paused.

## Phase 11 — Errors & Rate Limits

Deliverables
- Server sends standardized errors (see MULTIPLAYER_ERRORS.md).
- Lightweight per-connection/room rate limits.

Validation
- Send invalid inputs rapidly → see `rate_limited`; show toast/banners for fatal errors.

Acceptance
- Errors are descriptive; flooding is contained.

## Phase 12 — UX Polish & Copy

Deliverables
- Banners: “Resyncing…”, “Waiting for host…”, “Room expired”, with clear CTAs.
- Share conveniences: Copy Link/QR (optional), consistent empty/edge states.

Validation
- Mobile checks; text clarity; no layout jumps.

Acceptance
- Clean, understandable UX for common and error states.

## Phase 13 — E2E, Chaos, and Flag Removal

Deliverables
- E2E harness (mock relay) for happy path + resync + host pause.
- Chaos knobs: delay/reorder/drop to test buffering and resync.
- Documentation pass and remove feature flag.

Validation
- MULTIPLAYER_TESTING.md scenarios green; determinism checks pass.

Acceptance
- Feature can be enabled by default.

## Working Practices

- One phase per PR; keep diffs small and focused.
- Each PR includes: description, updated docs (if needed), test plan, and a checklist tying back to acceptance criteria.
- Rollbacks: keep server/client changes loosely coupled so issues can be isolated.

## Local Dev Tips

- Use two different browsers or profiles to simulate host and player.
- Add a small “debug panel” in dev builds to show: roomId, seq, last hash, connection status.
- Prefer deterministic seeds during development to reproduce issues.

