# Changelog

All notable changes related to End-of-Turn Improvements are documented here.

## [Unreleased]

### Added

- Continue Game or Start New rollout
  - Shared `useNewGameRequest` helper with confirmation dialog and telemetry hooks
  - Single-player **Play Again** and `/games` **New Game** actions now route through the shared workflow
  - Broadcast/pending guards to protect multi-tab sessions and expose dev `__START_NEW_GAME__` escape hatch
- Phase 1: State scaffolding
  - Added `sp.phase: 'summary' | 'game-summary'` entries
  - Added `sp.handPhase`, `sp.ack`, `sp.lastTrickSnapshot`, `sp.summaryEnteredAt?`
  - Validation extended for `sp/phase-set`
- Phase 2: Rules helper
  - New pure rules in `lib/state/spRules.ts` with unit tests
- Phase 3: Reducer hygiene + snapshot lifecycle
  - Set/clear `sp.lastTrickSnapshot` around reveal/clear/first-play
  - Kept idempotent apply-only semantics for SP events
- Phase 4: Engine batches and advance logic
  - `computeAdvanceBatch(state, now, opts?)` for unified next-action
  - Paused bots during reveal and summary
  - Set `sp.summaryEnteredAt` on entering summary
- Phase 5: UI CTA + Last Trick banner
  - Unified CTA to use `computeAdvanceBatch`
  - Added compact banner showing last trick winner
- Phase 6: Round summary screen (mobile-first)
  - Per-player stats, round facts, CTA, auto-advance (10s default)
- Phase 7: End-of-game summary
  - `sp.phase='game-summary'` with totals, winner(s), and Play Again
- Single-player persistence resilience
  - Snapshot writes emit `single-player.persist.snapshot` metrics with duration/failure streak data
    and raise `sp.snapshot.persist.quota_exceeded` when storage approaches quota.
  - Rehydrate fallback logs `single-player.persist.fallback` usage and surfaces warning toasts when
    localStorage takeover or repeated failures degrade persistence.

### Docs

- Updated `END-OF-TURN-FLOW.md` sequence diagrams to reflect summary/game-summary and CTA-driven engine batches.
- Updated `END-OF-TURN-IMPROVEMENTS.md` with an implementation summary and code links.
