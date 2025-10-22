# End‑of‑Turn Flow (Single Player)

This document shows the single‑player state transitions for the end of a hand (trick) and the end of a round, with exact events and reducers involved.

## End Of Hand (Trick)

```mermaid
sequenceDiagram
  participant U as User
  participant UI as SinglePlayerMobile_UI
  participant Hook as UseSinglePlayerEngine
  participant Eng as Engine
  participant Store as State_Store
  participant Red as Reducer
  UI-->>Store: sp/trick/played final card
  Store-->>Red: reduce
  Red-->>Store: trick complete
  Hook->>Eng: resolveCompletedTrick
  Eng-->>Hook: maybe sp/trump-broken-set
  Eng-->>Hook: sp/trick/reveal-set winnerId
  Eng-->>Hook: sp/ack-set ack='hand'
  Hook-->>Store: appendMany batch
  Store-->>Red: reduce events
  Red-->>Store: apply state updates
  U->>UI: Click CTA (Next Hand or Next Round)
  UI->>Eng: computeAdvanceBatch(state, now)
  Eng-->>UI: [sp/trick/cleared, sp/leader-set, sp/trick/reveal-clear, sp/ack-set('none')]
  UI-->>Store: appendMany batch
  Store-->>Red: reduce
  Red-->>Store: apply state updates
  Hook->>Eng: engine resumes bot may play
```

## End Of Round

```mermaid
sequenceDiagram
  participant U as User
  participant UI as SinglePlayerMobile_UI
  participant Hook as UseSinglePlayerEngine
  participant Eng as Engine
  participant Store as State_Store
  participant Red as Reducer
  Hook->>Hook: guard round done (no reveal, no hold)
  UI->>Eng: computeAdvanceBatch(state, now)
  Eng-->>UI: [made/set xN, round/finalize, sp/phase-set('summary'|'game-summary'), sp/summary-entered-set]
  UI-->>Store: appendMany batch
  Store-->>Red: reduce events
  Red-->>Store: apply state updates
  Note over UI: If phase === 'summary', show Round Summary
  U->>UI: Click CTA (Next Round) or wait for auto-advance
  UI->>Eng: computeAdvanceBatch(state, now, { intent: 'user'|'auto' })
  Eng-->>UI: [sp/deal, sp/leader-set, sp/phase-set('bidding'), round/state-set('bidding')] or [sp/phase-set('done')]
  UI-->>Store: appendMany batch
  Store-->>Red: reduce events
  Red-->>Store: apply
```

## Notes

- Bot plays pause during reveal and while in summary; resume after `sp/trick/cleared`/`sp/trick/reveal-clear` or when leaving summary.
- Round finalization is idempotent and gated by `sp.reveal == null` (ack handled via CTA flow).
- On entering summary, reducer stores `sp.summaryEnteredAt`; UI auto-advance may call `computeAdvanceBatch(..., { intent: 'auto' })` after the configured timeout.
- `round/finalize` scores the row and flips the next row to `'bidding'` if it was `'locked'`.
