# Implementation Plan: End‑of‑Turn Improvements (Single Player)

This plan breaks down the work in END-OF-TURN-IMPROVEMENTS.md into clear phases with owners, acceptance criteria, validation steps, and commit checkpoints. Each phase must keep the repo green (lint, format, typecheck, tests) and update documentation as needed. Use sub‑agents to parallelize where sensible.

## Principles

- Single source of truth for next action: engine computes batches; UI calls `advance()`.
- Minimal reducer: applies events; legality checked via `state/spRules.ts`.
- Explicit phases: add `sp.phase='summary'` (and `game-summary`), `sp.handPhase`, `sp.ack`, `sp.lastTrickSnapshot`, `sp.summaryEnteredAt`.
- Mobile‑first summary screen; bots pause during summary; optional auto‑advance.
- Safe, incremental rollout with feature flags/dev assertions where helpful.

## Tooling And Checks

- Lint: `npm run lint` (or `pnpm lint`/`yarn lint`).
- Format: `npm run prettier` or `npm run format` (ensure no diffs; otherwise `--write`).
- Types: `npm run typecheck`.
- Tests: `npm test` (unit+integration).
- CI: ensure the pipeline runs all above; fix or add scripts as needed.

## Phase 0 — Baseline + Branch Readiness

- Tasks
  - Verify local scripts for lint/format/typecheck/tests; add missing scripts.
  - Note current state schema and selectors touched by end‑of‑turn.
  - Add a short ADR link to improvements doc.
- Validation
  - All checks green locally.
- Commit
  - chore: baseline scripts and docs pointers

## Phase 1 — State Scaffolding (No Behavior Change)

- Tasks
  - Add types/fields: `sp.handPhase`, `sp.ack` ('none' | 'hand'), `sp.lastTrickSnapshot`, `sp.summaryEnteredAt?: number`.
  - Extend `sp.phase` union with `'summary'` (and placeholder `'game-summary'`).
  - Initialize defaults; serialize/deserialize in store; migration/default initializers as needed.
  - Add selectors stubs: `selectIsRoundDone`, `selectPrimaryCTA(state)`, `selectSummaryData(state)` (no UI use yet).
- Validation
  - Typecheck passes; no runtime behavior differences.
- Commit
  - feat(state): scaffold summary/hand phases and snapshot fields

## Phase 2 — Rules Helper (Pure)

- Tasks
  - Create `state/spRules.ts` with pure functions: `canPlayCard`, `isTrickComplete`, `isRoundDone`, `nextToAct`, `mustFollowSuit`, `canLeadTrump`.
  - Unit tests covering edge cases (follow suit, trump broken, order, trick complete).
- Validation
  - Tests pass; no engine/reducer wiring yet.
- Commit
  - feat(rules): add spRules with unit tests

## Phase 3 — Reducer Hygiene (Apply‑Only + Snapshot Lifecycle)

- Tasks
  - Keep reducer structural checks only; ensure idempotency of events already noted in the doc.
  - Implement snapshot lifecycle:
    - Set `sp.lastTrickSnapshot` on `sp/trick/reveal-set`.
    - Preserve through `sp/trick/cleared`.
    - Clear on first `sp/trick/played` when `sp.trickPlays` was empty.
  - Optional dev assertions (guarded): after critical events, assert invariants via `spRules`.
- Validation
  - Reducer unit tests for idempotency and snapshot lifecycle.
- Commit
  - feat(reducer): apply‑only semantics and lastTrickSnapshot lifecycle

## Phase 4 — Engine Batches And Advance Logic

- Tasks
  - Implement `computeAdvanceBatch(state, now)` per spec.
  - Add batches: `onTrickCompleted`, `onHandAcknowledge`, `onFinalizeRound` (sets `sp.phase='summary'`), `onSummaryContinue` (deal+leader+phase to bidding).
  - Gate plays via `spRules.canPlayCard`; set related follow‑ups (`sp/trump-broken-set`, etc.).
  - Record `sp.summaryEnteredAt` on entering summary; add auto‑advance using settings `summaryAutoAdvanceMs` (default 10000; 0 disables).
  - Pause bots while `sp.handPhase==='revealing'` or `sp.phase==='summary'`.
- Validation
  - Engine unit tests: mid‑trick, reveal, post‑clear, finalize→summary, summary continue, auto‑advance timing.
- Commit
  - feat(engine): advance logic, summary, and auto‑advance

## Phase 5 — UI: Single CTA + Hand Reveal + Snapshot Banner

- Tasks
  - Replace duplicate finalize handlers with single `appendMany(computeAdvanceBatch(state, Date.now()))`.
  - CTA selector: show 'Next Hand'/'Next Round' in reveal; no explicit finalize button (engine enters summary).
  - Use `sp.lastTrickSnapshot` for a small “Last Trick” banner after clear.
- Validation
  - Manual test: play through hands; banner appears; CTA advances correctly.
- Commit
  - feat(ui): unify CTA and add last‑trick banner

## Phase 6 — UI: Round Summary Screen (Mobile‑First)

- Tasks
  - Add summary view for `sp.phase==='summary'`: per‑player stats (name, bid, made, delta, totals), round facts (round#, trump, dealer, next leader).
  - Single CTA: 'Next Round' or 'Finish Game' if last round.
  - Auto‑advance indicator; cancel on interaction.
  - Ensure accessibility and small‑screen layout.
- Validation
  - Manual and snapshot tests of summary UI.
  - Refresh during summary resumes summary correctly.
- Commit
  - feat(ui): add round summary screen with auto‑advance

## Phase 7 — End‑of‑Game Summary

- Tasks
  - Add `sp.phase='game-summary'` on final round finalize.
  - UI screen with totals, winner(s), and 'Play Again' CTA; optional auto‑advance per settings.
  - Wire `onGameSummaryContinue` (reset/new game flow as appropriate for app).
- Validation
  - Unit tests for final round path; manual UI validation.
- Commit
  - feat(ui): game summary phase and flow

## Phase 8 — Documentation + Diagrams

- Tasks
  - Update `END-OF-TURN-IMPROVEMENTS.md` to reflect implementation details (links to code, selectors, batches).
  - Update `END-OF-TURN-FLOW.md` diagrams for v8‑compatible Mermaid, matching actual flows (summary included).
  - Add CHANGELOG entries.
- Validation
  - Render diagrams; spot‑check against behavior.
- Commit
  - docs: update end‑of‑turn flow and summary

## Phase 9 — Testing Matrix And Hardening

- Tasks
  - Expand integration tests: refresh mid‑reveal, before finalize, during summary; auto‑advance timing; bot pause/resume.
  - Property tests for invariants (counts, leader progression, snapshot lifecycle).
  - Performance pass: ensure no excessive re‑renders or heavy computations.
- Validation
  - CI stable across runs; timing flake protection (mock timers where possible).
- Commit
  - test: broaden end‑of‑turn coverage and stabilize timing

## Phase 10 — Rollout And Cleanup

- Tasks
  - Remove obsolete events (`sp/round/acknowledged`) and dead code.
  - Confirm feature flags and dev assertions toggles set appropriately for release.
  - Final documentation polish.
- Validation
  - All checks green; UX sign‑off on mobile.
- Commit
  - chore: cleanup obsolete flows and finalize end‑of‑turn rollout

## Sub‑Agents And Ownership

- Rules/Reducer Agent: `state/` changes, invariants, tests.
- Engine Agent: `engine/` batches, advance logic, timers, bot gating.
- UI Agent: CTA unification, reveal banner, summary screens.
- QA Agent: test plan execution, fixtures, mock timers, device checks.
- Docs Agent: diagrams and docs synchronization.

## Validation Gates (Every Phase)

- Lint/Format: repository style clean.
- Typecheck: no TS errors.
- Tests: unit+integration pass locally and in CI.
- Docs: updated to reflect new behaviors; links to code where appropriate.
- Commit: single focused commit per phase with clear message.

## Backout Strategy

- Each phase is isolated and reversible. If a phase breaks CI, revert that commit and fix forward on a new branch.
