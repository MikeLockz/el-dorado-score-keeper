# Multiplayer Testing Plan — El Dorado

This document outlines E2E and chaos testing for the multiplayer MVP.

## E2E Happy Path

- Create/join: A creates room, B joins; roster shows both; Start enabled for host.
- Start/deal: Host starts; dealer sends hand; `sp/deal` broadcast; both render round.
- Bidding: B sends input; host broadcasts bid/set; both update.
- Tricks: play through one trick; host emits `sp/trick/played` and `sp/trick/cleared`.
- Finalize: host emits `made/set` and `round/finalize`; totals match.

## Reconnect & Resync

- Non-host refreshes during bidding: auto rejoin/resync via snapshot; state matches.
- Non-host refreshes during trick: same as above.
- Snapshot timeout path: donor absent → client falls back to lobby with message.

## Host Disconnect Pause/Resume

- Host drops: other clients show “Waiting for host…”; inputs blocked.
- Host returns within TTL: game resumes from last `seq`; no duplicate events applied.

## Chaos (Order/Delay)

- Delay/reorder inputs before the host: ensure host validates `turnId` and ignores stale/out-of-turn inputs.
- Delay/reorder broadcast `event`s at clients: buffer small gaps; request resync when gaps persist.

## Determinism Checks

- Hash after key milestones (post-bid, post-trick, post-finalize) to compare client states in test harness.
