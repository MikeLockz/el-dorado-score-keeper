# Command-Line Port Feasibility

## Current Architecture Snapshot

- Event-sourced core lives in `lib/state/types.ts:5-200`, defining the full event catalogue, immutable `AppState`, and a pure reducer that delegates roster mutations to `lib/roster/ops.ts:1-108`.
- Scoring and round helpers are pure math utilities (`lib/state/logic.ts:3-49`), already consumed by selectors and reducers without React or DOM dependencies.
- Event construction stays declarative (`lib/state/events.ts:6-73`), making it easy to reuse intent builders across adapters.
- Derived views (leaderboards, round summaries, roster projections) are exposed as memoised selectors in `lib/state/selectors.ts:1-160`, which operate purely on `AppState` objects.
- Documentation in `docs/STATE.md:5-94` describes the current IndexedDB + BroadcastChannel runtime, confirming intent to keep reducers/persistence decoupled.

## Reuse Potential for a CLI Adapter

- All scoring, bidding, roster, and single-player rules execute in pure TypeScript; nothing in `lib/state/**` references JSX or browser-only globals aside from the persistence layer wrappers.
- Unit/integration suites already exercise the state machine under Node with polyfills (`tests/unit/instance.test.ts:1-105`, `tests/setup/global.ts:1-111`), demonstrating the reducer can run headless.
- The `lib/state/events.ts` builders and `validation.ts` schemas (e.g. `lib/state/validation.ts:1-74`) give a ready-made boundary for parsing CLI commands into safe events.
- Because selectors are UI-agnostic, a CLI can reuse them for formatted tables or summaries without reimplementing scoring math.

## Primary CLI Use Case

- MVP scope: drive a single game from setup through final scoring, omitting meta flows such as managing saved games, player profile editing, or tournament rotation.
- CLI start-up can assume players are supplied inline (flags, prompt answers, or a seed fixture) and immediately transition into turn-by-turn event dispatch.
- The terminal experience must emit the same event log produced by the web adapter so that the full lifecycle (bids, draws, buys, scoring) is reviewable post-game.
- Supporting utilities (player CRUD, game archive lists) can stay web-only until the game path proves stable.

## Friction Points to Address

- Persistence is hard-wired to browser APIs: `createInstance` opens IndexedDB and BroadcastChannel directly (`lib/state/instance.ts:18-173`), and lower-level helpers assume `indexedDB`/`IDBKeyRange` availability (`lib/state/db.ts:21-51`).
- Archival/import flows touch `localStorage`, `StorageEvent`, and BroadcastChannel (`lib/state/io.ts:60-458`), all of which need server-side replacements.
- React-specific wiring in `components/state-provider.tsx:1-197` seeds players, manages time-travel, and exposes append helpers; a CLI must provide its own loop without relying on React state transitions.
- Some convenience utilities expect browser globals even if they fall back (`lib/utils.ts:7-18` attempts `globalThis.crypto.randomUUID`), so a CLI runtime should ensure either Node 19+ crypto or accept the Math.random fallback.
- Build tooling targets Next.js (ESM, JSX). A CLI distribution will need a Node-friendly entry point (ts-node, esbuild, or Bun) plus CommonJS/ESM module resolution plan.

## Recommended Adapter Strategy

- **Abstract persistence**: introduce a small `PersistencePort` (append, listSince, snapshot) so the CLI can back events with JSON files or SQLite while the web keeps IndexedDB. `createInstance` can accept an injected implementation instead of constructing IndexedDB directly.
- **Replace cross-tab signals**: expose an event emitter interface used by both adapters; the CLI version can be an in-process emitter, while the browser keeps BroadcastChannel/localStorage.
- **Build a command dispatcher**: reuse `events` and `validateEventStrict` to map CLI verbs into `AppEvent`s, then apply them through the shared reducer. Selectors can format round summaries and leaderboards for terminal output.
- **Align event log rendering**: extract the log formatting utilities used by the web UI (or create shared helpers) so the CLI can mirror the same chronological narrative and polymorphic payloads.
- **State history storage**: either reuse the event-sourcing model with a file-backed append-only log or, for a lightweight MVP, keep state in memory and periodically serialize `AppState` via `JSON.stringify`.
- **Testing**: extend existing Vitest suites with a CLI-focused harness (simulate command input, assert resulting state) to guarantee parity.

## Feasibility Assessment

Reusing the rules engine is **highly viable**: the scoring math, event reducer, and selectors are already presentation-agnostic. The main engineering cost lies in extracting the persistence/event-bus layer from browser-only implementations. Once a pluggable storage abstraction exists, both adapters can share >90% of the domain code.

## Suggested Next Steps

1. Sketch a `StateStore` interface and refactor `createInstance` to accept an implementation; provide IndexedDB and file-backed prototypes.
2. Prototype a minimal Node script that loads `INITIAL_STATE`, applies a representative full-game event script, and prints both selector output and the shared event log to confirm parity.
3. Plan CLI UX (commands, prompts, screen rendering) with MVP focus on the core turn loop; ensure each action maps to an existing event builder before expanding to roster/admin flows.
