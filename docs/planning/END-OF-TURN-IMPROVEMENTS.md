# End‑of‑Turn Improvements (Single Player)

Goals: simplify and harden end‑of‑hand and end‑of‑round logic so UI always matches state, clearly informs the user what to do next, and minimizes edge cases and special‑case code.

## Pain Points Today

- Split orchestration: end‑of‑hand and finalize flow is spread across `useSinglePlayerEngine`, `engine.ts`, and UI handlers (duplicate finalize logic in `SinglePlayerMobile.tsx`).
- Mixed responsibilities: UI decides which batch to send (clear vs finalize) instead of asking the engine for “the right next step”.
- Implicit sub‑states: `sp.reveal` + `sp.finalizeHold` encode a small state machine implicitly, which invites drift and conditional checks sprinkled across effects.
- Auto‑deal safety duplicated: two separate effects in `app/single-player/page.tsx` initiate deals under different conditions.
- Reducer permissiveness: `sp/trick/played` enforces turn order and idempotency, but legality (follow suit, trump‑broken when leading) is enforced only by UI/bot.
- Repeated UI handlers: two near‑duplicate Finalize handlers in `SinglePlayerMobile.tsx`.

## Proposed Direction

- Single source of truth for the “next action”: engine computes the next batch given current state. UI triggers a single `advance()` and renders labels from selectors.
- Explicit finite state: make hand/round sub‑states explicit to reduce scattered boolean checks.
- Keep reducer minimal: apply events and enforce only structural/idempotency invariants; enforce gameplay legality in the engine via a lightweight rules helper.
- Consolidate deal/start transitions and round advancement into standard batches.

- Add `sp.handPhase`: 'idle' | 'revealing'.
  - Set to 'revealing' with `sp/trick/reveal-set`; back to 'idle' on `sp/trick/reveal-clear`.
  - Replace uses of `sp.reveal != null` in effects with `sp.handPhase === 'revealing'`.
- Replace `sp.finalizeHold: boolean` with `sp.ack: 'none' | 'hand'`.
  - 'hand' when last hand completed and waiting for user ack.
  - UI derives button label from `sp.ack` when revealing a hand.
- Add explicit round summary phase: extend `sp.phase` with `'summary'`.
  - After `round/finalize`, set `sp.phase='summary'` automatically; no separate finalize CTA is shown.
  - Exit summary on a single CTA to begin next round (deal + bidding).
- Persist `sp.lastTrickSnapshot` (ledBy, plays, winnerId) to support animation/history and survive refresh.
  - Set on `sp/trick/reveal-set` using the completed trick.
  - Preserve through `sp/trick/cleared` so recap remains after table clear.
  - Clear on the first `sp/trick/played` of the next trick (i.e., when adding to an empty `sp.trickPlays`).

## Event Set Changes (backward compatible additions)

- Add `sp/advance` intent event that the engine reduces into the correct batch server‑side or in a handler. If reducer remains pure, implement `computeAdvanceBatch(state)` and have UI call that.
- Add `sp/hand/acknowledged` to clear reveal, advance leader, and clear `sp.ack` from 'hand' to 'none'.
- Keep existing events for compatibility; new helpers produce standardized batches:
  - `spBatches.onDeal(roundNo, dealerId, deal)` → `sp/deal`, `sp/leader-set`, `round/state-set('bidding')`.
  - `spBatches.onConfirmBids()` → `sp/phase-set('playing')`, `round/state-set('playing')`.
  - `spBatches.onTrickCompleted(winnerId)` → `sp/trump-broken-set?`, `sp/trick/reveal-set`, `sp/ack('hand')`.
  - `spBatches.onHandAcknowledge()` → `sp/trick/cleared`, `sp/leader-set`, `sp/trick/reveal-clear`, `sp/ack('none')`.
  - `spBatches.onFinalizeRound()` → all `made/set`, `round/finalize`, `sp/phase-set('summary')`. Do not auto‑deal here.
  - `spBatches.onSummaryContinue(nextRound, dealerId, firstToAct, deal)` → `sp/deal(nextRound)`, `sp/leader-set(firstToAct)`, `round/state-set(nextRound,'bidding')`, `sp/phase-set('bidding')`.
  - Snapshot lifecycle (implicit): reducer sets `sp.lastTrickSnapshot` on `sp/trick/reveal-set` and clears it automatically on the first play of the next trick.

## Engine Simplifications

- Export a single `computeAdvanceBatch(state, now)` used by UI for the primary CTA.
  - If `sp.handPhase === 'revealing'`: return `onHandAcknowledge()`.
  - Else if round is done (selector) and not yet scored: return `onFinalizeRound()` (which enters `summary`).
  - Else if `sp.phase === 'summary'`: return `onSummaryContinue(...)` to enter next round bidding.
  - Else return `[]`.
- Centralize auto‑deal: provide `ensureDealBatch(state, roundNo, players)` to be used from one effect in `useSinglePlayerEngine` instead of two effects in the page.
- Consolidate bot flows: keep bot plays paused when `sp.handPhase === 'revealing'` or `sp.ack !== 'none'`.
- Enforce legality in engine: gate `sp/trick/played` and related follow‑ups by consulting `spRules` before dispatching.
- Pause during summary: bots and auto‑advance are suspended while `sp.phase === 'summary'`.

### Summary Auto‑Advance

- Behavior: Allow auto‑advance out of `summary` after a configurable timeout (default 10s) with user interaction canceling the timer.
- State: On entering summary, set `sp.summaryEnteredAt: number` (epoch ms). Persisted so refresh keeps the timer context.
- Engine: `computeAdvanceBatch(state, now)` auto‑returns `onSummaryContinue` when `now - sp.summaryEnteredAt >= settings.summaryAutoAdvanceMs` (default 10000).
- Settings: `settings.summaryAutoAdvanceMs` configurable; 0 disables auto‑advance.

## Reducer Hardening

- Apply‑only semantics: reducer remains pure and does not decide play legality.
- Structural checks only:
  - Validate identifiers exist (playerId present, card belongs to hand shape) and ignore malformed events.
  - Maintain idempotency: ignore duplicate `sp/trick/reveal-set` when already revealing; ignore `sp/trick/cleared` when already empty.
  - `round/finalize` returns same state when round already 'scored' (already true).
- Optional dev assertions (flagged): call rules to assert invariants during development without gating production behavior.

## Rules Helper (state/spRules.ts)

- Purpose: centralize pure rule checks used by the engine (and optionally reducer dev assertions). No UI/engine imports.
- Suggested API:
  - `canPlayCard(state, playerId, card)` → boolean | { ok: boolean, reason?: string }

## Implementation Summary (as built)

- State and Events
  - Added fields: `sp.handPhase`, `sp.ack`, `sp.lastTrickSnapshot`, `sp.summaryEnteredAt?`; extended `sp.phase` with `'summary' | 'game-summary'`.
  - Added events and validation: `sp/ack-set`, `sp/summary-entered-set`.
  - Files: `lib/state/types.ts`, `lib/state/events.ts`, `lib/state/validation.ts`.

- Rules
  - `lib/state/spRules.ts`: `nextToAct`, `isTrickComplete`, `isRoundDone`, `mustFollowSuit`, `canLeadTrump`, `canPlayCard`.

- Engine
  - `lib/single-player/engine.ts`:
    - `computeAdvanceBatch(state, now, opts?)` implements on-trick-complete, on-hand-acknowledge, on-finalize-round → `summary | game-summary`, and on-summary-continue.
    - Bot plays pause during reveal/summary.

- UI
  - `components/views/SinglePlayerMobile.tsx` uses a single CTA wired to `computeAdvanceBatch(...)`.
  - Adds round summary screen (mobile-first) and small "Last Trick" banner.
  - Adds game summary screen with "Play Again" (archives and resets).

- Tests
  - New unit tests for rules, reducer snapshot lifecycle, engine advance logic, and UI summary flows.

  - `isTrickComplete(state)` → boolean
  - `isRoundDone(state)` → boolean
  - `nextToAct(state)` → playerId
  - `mustFollowSuit(state, card)` → boolean
  - `canLeadTrump(state, playerId)` → boolean

- Properties: stateless, deterministic, thoroughly unit‑tested.

## UI Changes

- Single CTA: derive label and disabled reason from a selector:
  - If `sp.handPhase === 'revealing'`: label 'Next Hand' or 'Next Round' based on progress.
  - Else if `sp.phase === 'summary'`: label 'Next Round' (or 'Finish Game' on final round).
  - Else if round done and not scored: no extra finalize button; engine advances to summary.
  - Else: disabled with reason from selector (e.g., 'Waiting for plays').
- Replace both Finalize button handlers in `SinglePlayerMobile.tsx` with a single call: `appendMany(computeAdvanceBatch(state, Date.now()))`.
- Replace confirm‑bid handler to use `spBatches.onConfirmBids()` to always set both `sp/phase-set('playing')` and `round/state-set('playing')`.
- Use `sp.lastTrickSnapshot` to render a Last Trick banner/recap after clear; persists across refresh until the next trick begins.

### Summary Screen (Mobile‑first)

- Content (per player): name, bid, made, delta, total score; highlight dealer, next dealer, and next leader.
- Round facts: round number, trump, dealer, first to act next round.
- Actions: single primary CTA ('Next Round' or 'Finish Game'); secondary link to round history if present.
- Layout: single column, large type, accessible color contrast; fits small screens; supports swipe/tap to continue.

## Invariants To Enforce (and test)

- While `sp.handPhase === 'revealing'`: `sp.trickPlays.length === sp.order.length` and `sp.reveal != null`.
- After `sp/trick/cleared`: `sp.trickPlays.length === 0` and `sp.reveal == null`.
- Leader progression: after hand ack, `sp.leaderId === reveal.winnerId`.
- Counting: `sum(sp.trickCounts) increments by 1` exactly on reveal, never elsewhere.
- Finalization gating: finalize emits no events if `sp.handPhase === 'revealing'` or `sp.ack !== 'none'`.
- Deal presence: when `rounds[r].state in {'bidding','playing'}`, the deal exists (order, trump, hands non‑empty).
- Snapshot lifecycle: when revealing, snapshot exists; after `sp/trick/cleared`, snapshot still exists; after the next `sp/trick/played` into an empty trick, snapshot becomes null.
- Summary gating: after `round/finalize`, `sp.phase==='summary'` and remains until `onSummaryContinue` is applied; no bot actions fire during summary.
- Summary persistence: `sp.phase==='summary'` and `sp.summaryEnteredAt` survive refresh; auto‑advance respects elapsed wall time.

## Testing

- Unit tests for `spRules` (follow suit, trump lead gating, nextToAct, trick complete, round done).
- Unit tests for `computeAdvanceBatch` across states: mid‑trick, revealing, post‑clear, final round vs mid rounds.
- Property tests for invariants over a long sequence of plays, reveals, clears, and finalizes.
- Reducer tests for idempotency and structural ignores (not legality).
- Integration tests: refresh mid‑reveal, refresh just before finalize, ensure idempotent replay. Verify snapshot persists across refresh and clears on the first lead of the next trick.
- Summary flow tests: last hand → finalize emits summary; summary screen shows per‑player stats; Continue enters next round (deal + bidding) with no intermediate finalize CTA.
- Auto‑advance tests: entering summary sets `summaryEnteredAt`; after `>= summaryAutoAdvanceMs`, engine returns `onSummaryContinue`; user input cancels/resets as designed.

## Migration Plan

- Introduce selectors for hand/round CTA and progress; adopt in UI.
- Add `sp.handPhase` and `sp.ack`, migrate existing checks to use them; keep `sp.reveal` for winner identity.
- Implement `computeAdvanceBatch` and refactor UI Finalize/Continue button to use it.
- Replace duplicate finalize handlers with one.
- Move deal safety from page to engine (single effect entry point).
- Add `state/spRules.ts`; refactor engine to call it for legality; keep reducer minimal.
- Optionally enable reducer dev assertions backed by `spRules` after tests pass.
- Add `summary` to `sp.phase`; implement `onFinalizeRound` to set summary; implement `onSummaryContinue` to deal and enter bidding.
- Add `sp.summaryEnteredAt` and wire auto‑advance timing into `computeAdvanceBatch(state, now)`.

## Open Questions

- Should we surface an explicit round summary state (`sp.phase='summary'`) before returning to bidding in the next round, or keep current immediate restart with acks?

## Decision: Reducer vs. Engine vs. Rules

- Decision: keep the reducer minimal and enforce legality in the engine via `state/spRules.ts`.
- Rationale: reduces coupling, keeps event application pure, and concentrates game logic in a testable, shared rules module.

## Decision: LastTrickSnapshot Persistence

- Decision: persist `sp.lastTrickSnapshot` in the store; set it on reveal and clear it on the first `sp/trick/played` of the next trick.
- Rationale: enables a recap after clear, helps replay/debug, and survives refresh without adding new events.

## Decision: Round Summary Phase

- Decision: add an explicit `sp.phase='summary'` after round scoring; no separate finalize CTA. The summary shows per‑player stats and presents a single CTA to start the next round.
- Rationale: provides a clear pause to digest scoring and mistakes, simplifies CTA logic to exactly one action when a round completes, and avoids double-confirm flows.

## End‑of‑Game Summary

- State: add `sp.phase='game-summary'` when the last round is finalized.
- UI: show game totals, winner(s), tiebreak details if any, and a single CTA ('Play Again').
- Auto‑advance: optional timer uses the same settings; default 10s.
- Bots paused: remain paused until user restarts or auto‑advance fires.

By standardizing next‑action computation, making mini‑states explicit, and hardening reducer guards, we can reduce UI conditionals, avoid races, and ensure the UI always reflects authoritative state with clear prompts for the player.
