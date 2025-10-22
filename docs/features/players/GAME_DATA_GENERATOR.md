# Game Data Generator Plan

## 1. Context & Purpose

- Provide a deterministic utility inside the developer tools to fabricate a complete, replayable game session that mirrors realistic table behavior for manual QA, demos, and regression testing.
- Generated sessions must respect the existing state architecture (events stream, reducer snapshots, IndexedDB archives) so the rest of the application can consume them without conditional code paths.
- The experience should let a developer populate IndexedDB with one click, instantly making a synthetic game available everywhere a real archived game would surface.

## 2. Goals & Non-Goals

- **Goals**
  - Generate a roster, event history, per-round tallies, and summary metadata that look indistinguishable from live play.
  - Persist the result into the `app-games-db` (games store) and any other stores relied on by replay or summaries.
  - Allow immediate replay/load of the archived session through existing “load from archive” flows.
  - Make the tooling accessible behind a guarded DevTools-only control (hidden from production users).
- **Guarantees**
  - Every generated game is fully completed through summary confirmation before persistence.
  - No metadata flags, naming conventions, or markers reveal that the game is synthetic.
- **Non-Goals**
  - No need to expose UI/UX to non-developers.
  - Do not create server APIs or persist to remote storage.
  - Do not attempt to generate tournament/multi-game aggregates in this iteration.

## 3. UX Entry Point (DevTools Button)

- Add a “Generate Single Player Game” button to the existing in-app DevTools panel (confirm exact component in `components/devtools`).
- Show a brief tooltip/description clarifying that it seeds IndexedDB with a realistic archived game for solo testing.
- Optional advanced controls (future): seed input, player count slider, round count override.
- After click:
  - Disable button and show loading state while generation + persistence runs.
  - On success, surface the generated game id and quick link to “Open in Archive Viewer”.
  - On error, display toast/log with actionable message (include stack in console).

## 4. Data Generation Requirements

### 4.1 Roster Creation

- Derive between 2–10 players per game (align with single-player archive rules); default 4 unless overridden. The shared roster helper in `lib/devtools/generator/playerDataGenerator.ts` implements this contract—see `PLAYER_DATA_GENERATOR.md` for the full API surface.
- Maintain a deterministic pool of 10 simple three-letter names and UUIDs and sample without replacement per game (templates centralized in the player data generator module):
  - `bob` → `585a8ad2-0dfb-4c32-9f92-0b2d1a7f3d51`
  - `sue` → `a0c69b29-914f-4ec1-9c0e-7f5471a2c4b5`
  - `pat` → `6b7f6d21-e8a1-4d6c-9dc1-1c6c73bb8e5c`
  - `amy` → `4b1cf7a5-8f20-4e2d-9c9f-3a48f351aa19`
  - `rex` → `f68fb18b-82d5-45f8-8c83-40e501cdb525`
  - `liv` → `7e8bd9b3-0ba8-4fae-8c9c-5c881f0cc3bf`
  - `gus` → `c918e1b6-3f2a-4f3c-8a96-1c4c24c6e219`
  - `uma` → `1fb0a0ad-d3ea-4688-9c6f-4753a91fd5ab`
  - `ned` → `b5f54233-54fe-4b4a-8de5-4c43d945350f`
  - `ivy` → `d72a5f4f-b771-4f29-86bd-3e9c5587039d`
- Ensure exactly one roster entry reuses the current single-player user’s id (and associated profile info) so the archive reflects their participation; pull metadata from local state selectors.
- Each player object must include the same fields the real lobby produces: `id`, `displayName`, `avatarSeed` (if used), `seat`, `isBot`, etc.
- Ensure roster order matches seat order used in round/bid structures.
- Respect host designation if the game metadata expects one.

### 4.2 Game Metadata

- Populate `GameRecord.summary` fields: `id`, `createdAt`, `updatedAt`, `startedAt`, `summaryEnteredAt`, `roundsCompleted`, `finalScores`, `durationMs`, `version`.
- Generate plausible table configuration flags (deck size, bid rules, scoring variant) using defaults from production config modules (`lib/config/game.ts` or similar).
- Include device/session ids when required; if optional, use synthetic but consistent UUIDs.
- Timestamp cadence should mimic real play: round start/finish spaced 1–5 minutes apart with slight jitter; maintain chronological order.
- Avoid adding debug markers, flags, or naming cues that could reveal the archive was generated.

### 4.3 Round & Bid Simulation

- Determine round ordering per single-player rules: start at round 10 and descend each round until the configured finale (typically round 1); ensure `roundsCompleted` reflects this.
- For each round:
  - Fix the target trick count near 10 regardless of player count (allow ±1 variance to avoid mechanical repetition).
  - Generate individual bids so their total remains within ±2 of 10, matching the single-player expectation for round 10 while still allowing occasional over/under variance.
  - Bias distribution:
    - At least one `0` bid in ~40–60% of rounds.
    - Occasionally (10–20% of rounds) a single player takes a high bid (≥5 tricks).
    - Maintain that players do not always repeat the same bid patterns; add round-to-round variation tied loosely to player “style” profiles (cautious vs aggressive).
  - Derive trick results per player to support “bid vs tricks” calculations, ensuring round outcomes remain feasible (total tricks taken equals the configured goal).
  - Compute per-round scores according to actual scoring rules (consult reducer helpers; reuse existing scoring utility if possible).
- Record any bonus/penalty events (perfect bids, overtricks) the ruleset expects; avoid impossible combinations.

### 4.4 Event Stream

- Build a linear list of reducer events that mirrors live gameplay (`game/start`, `seat/set`, `round/start`, `bid/set`, `trick/complete`, `score/set`, `round/complete`, `summary/submit`, etc.).
- Each event must include payload shapes identical to production and timestamps for hydration.
- Maintain referential integrity: player ids in events must match roster; round numbers must ascend.
- Capture intermediary state needed for replay (e.g., trick-level breakdowns if the replay UI expects them).

### 4.5 Scorecard Data

- Do not generate or persist standalone scorecard datasets; rely on round tallies and existing selectors to derive any scoreboard views.

## 5. Persistence & Replay

- Write final `GameRecord` into IndexedDB `app-games-db` → `games` store, matching existing schema (check `lib/state/io.ts`).
- Persist supporting state if required:
  - Event bundle into `app-db` (events store) when replay utilities depend on it.
  - Round tallies and metadata caches used by summary selectors; skip generating dedicated scorecard datasets.
- After persistence, trigger any state listeners that normally fire when a new archive is available (e.g., dispatch same action as import flow).
- Validate that loading the new game via “Load from Archive” executes the standard replay pipeline without special handling.

## 6. Determinism & Variability

- Allow seeding the RNG via optional query string/environment flag to reproduce game states for snapshots/tests.
- Without a seed, rely on crypto-safe randomness or high-quality PRNG to avoid obvious patterns.
- Ensure repeated clicks produce different games (unless seed reused).

## 7. Testing & Validation

- Add unit coverage for generator functions ensuring:
  - Sum of tricks taken equals round trick count.
  - Bids respect min/max rules and probability distribution (statistical checks with seeded RNG).
  - Generated data passes schema validation (reuse existing Zod/TypeScript validators).
- Provide a dev-only Cypress/Playwright smoke that clicks the button, waits for completion, then opens the archive and confirms the replay timeline renders.
- Manual checklist:
  - Inspect IndexedDB entries via browser DevTools.
  - Replay the generated game to ensure UI steps through rounds without console errors.
  - Verify generated roster matches participant ids in events and scores.

## 8. Implementation Steps

1. **Schema Audit:** Confirm structures for `GameRecord`, event payloads, and IndexedDB stores.
2. **Generator Library:** Implement pure functions for rounds, bids, trick outcomes, and scoring using shared utilities. Roster generation (registry, RNG, normalization) now lives in `playerDataGenerator.ts`; reuse those exports instead of duplicating logic.
3. **Event Assembly:** Translate generated structures into chronological event list + summary bundle.
4. **Persistence Adapter:** Reuse existing import/save functions to write into IndexedDB while explicitly skipping scorecard-related stores; add guard rails for dev use.
5. **DevTools UI:** Add button + status handling; wire click to generator workflow.
6. **QA Hooks:** Seeded RNG support, tests, and dev smoke automation.

## 9. Open Questions

- Should generated games include partial rounds or mid-game abort scenarios for resilience testing?
- Are there game variants (short deck, team modes) we should randomize across, or stick to the default for now?
- How should we handle localization for generated player names and metadata strings (if relevant)?
