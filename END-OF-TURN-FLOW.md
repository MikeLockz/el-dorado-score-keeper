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
  Eng-->>Hook: maybe sp/finalize-hold-set hold true
  Eng-->>Hook: sp/trick/reveal-set winnerId
  Hook-->>Store: appendMany batch
  Store-->>Red: reduce events
  Red-->>Store: apply state updates
  U->>UI: if last trick click Continue
  UI->>Store: finalize-hold false
  UI->>Store: trick cleared winnerId
  UI->>Store: leader set winnerId
  UI->>Store: reveal clear
  U->>UI: if not last trick click Next Hand
  UI->>Store: trick cleared winnerId
  UI->>Store: leader set winnerId
  UI->>Store: reveal clear
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
  Hook->>Hook: guard round done and no reveal and no hold
  Hook->>Eng: finalizeRoundIfDone
  Eng-->>Hook: made set for each player
  Eng-->>Hook: sp/phase-set done
  Eng-->>Hook: round finalize current round
  Eng-->>Hook: optional sp/deal nextRound
  Eng-->>Hook: optional sp/leader-set firstToAct
  Eng-->>Hook: optional sp/phase-set bidding
  Eng-->>Hook: optional round/state-set nextRound bidding
  Hook-->>Store: appendMany batch
  Store-->>Red: reduce events
  Red-->>Store: apply state updates
  Hook-->>UI: onAdvance with nextRound and dealerId if dealt
  UI->>UI: update local round dealer view state
  Hook->>Eng: if reveal or hold active return empty
  U->>UI: if reveal shown click Continue
  UI->>Store: finalize-hold false
  UI->>Store: trick cleared
  UI->>Store: leader set
  UI->>Store: reveal clear
  Hook->>Hook: next effect passes guards finalize proceeds
```

## Notes

- Bot plays pause during reveal; resume after `sp/trick/cleared` and `sp/trick/reveal-clear`.
- Round finalization is idempotent and gated by `sp.reveal == null` and `sp.finalizeHold == false`.
- `round/finalize` scores the row and flips the next row to `'bidding'` if it was `'locked'`.
