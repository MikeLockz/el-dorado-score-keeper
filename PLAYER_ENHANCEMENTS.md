**Overview**

- **Goal:** Resolve confusion and data coupling between Score Card and Single Player by separating player rosters per mode, improving first‑run setup in Single Player, and highlighting the real user.
- **Scope:** State model, events, UI flows for player creation/reset, and SP display tweaks. No network or backend changes.

**Problem 1 — Shared Players Across Modes**

- **Issue:** One `state.players` roster is used by both Score Card and Single Player, causing unintended cross‑mode edits and resets.
- **Recommendation:** Introduce separate, mode‑scoped rosters.
  - **State:**
    - Keep `state.players` for Score Card (backward‑compatible).
    - Add `state.spRoster: Record<string, string>` and `state.spHumanId: string | null` for Single Player.
  - **Events (new):**
    - `sp/player/added { id, name }`, `sp/player/renamed { id, name }`, `sp/player/removed { id }`, `sp/players/reordered { order: string[] }`, `sp/human-set { id }`.
  - **Selectors:**
    - Add `selectSpPlayersOrdered(state)` mirroring `selectPlayersOrdered` but using `state.spRoster` and `state.display_order_sp` (a separate dense order map).
    - Update SP code paths to use SP selectors and SP order map when computing trick counts and names.
  - **Reducer updates:**
    - SP events mutate `spRoster` and `display_order_sp` only. Score Card events continue to mutate `players` and `display_order`.
  - **UI routing awareness:**
    - Pages under `/scorecard` and `/players` operate on Score Card roster by default (existing behavior).
    - Pages under `/single-player` operate exclusively on SP roster and SP events.
  - **Compatibility:**
    - No migration is required for existing local data; SP will simply start with an empty `spRoster` and prompt on first run (Problem 2). Existing Score Card rosters continue to work unchanged.

**Problem 2 — Reset + Auto‑seed Behavior**

- **Issue:** Clicking Reset Players clears the shared roster, and navigating to Single Player auto‑creates 4 UUID players. This surprises users and hides choice of player count.
- **Recommendation:** Replace implicit auto‑seed with an explicit first‑run prompt, and ensure resets are mode‑scoped.
  - **Mode‑scoped reset:**
    - Players page gains a mode toggle or two sections:
      - “Score Card Players” with a “Reset Score Card Players” action → emits `player/removed` for each `state.players`.
      - “Single Player Roster” with a “Reset Single Player Roster” action → emits `sp/player/removed` for each `state.spRoster` and clears `sp/human-set` (`spHumanId = null`).
    - Copy updates clarify scope: resets affect the current mode only.
  - **Remove implicit seeding:**
    - Delete the default seeding in `components/state-provider.tsx` that adds `Player 1..4` when db is fresh.
  - **SP first‑run modal (no roster yet):**
    - On entering `/single-player`, if `state.spRoster` is empty, show a modal:
      - Title: “How many players?”
      - Options: 2–6 players (allow 2–10 if you want parity with score card; SP supports >5 via two decks).
      - Primary: “Start Game”.
    - On confirm, seed in a single batch:
      - Create exactly N players, where N is chosen.
      - Naming:
        - Real user: `Player 1`.
        - Bots: `Bot 1`, `Bot 2`, … `Bot ${N-1}`.
      - Events: `sp/player/added` for each, then `sp/human-set { id: player1Id }`, then optional `sp/players/reordered` to seat the human as desired.
    - Persist IDs via `uuid()` and store human id in `spHumanId`.
  - **Future runs:**
    - If `spRoster` has players, skip the modal and continue with the existing session or allow a “New Game” CTA to re‑seed.

**Problem 3 — Clarify the Real Player**

- **Issue:** It is unclear which auto‑generated player corresponds to the user.
- **Recommendation:** Annotate the human player everywhere in SP.
  - **Display only:** Append `" (you)"` after the human’s display name when rendering in Single Player views.
    - Update name helpers in SP components (e.g., `SinglePlayerMobile`, `SpTrickTable`, `SpRoundSummary`, `SpGameSummary`) to check `state.spHumanId` and render `${name} (you)` for that id.
  - **No rename side‑effects:** Keep raw names in state as `Player 1`/`Bot X`; the “(you)” suffix is a view concern.
  - **Players management (SP):** Show a badge or the same “(you)” suffix when listing SP roster to reinforce clarity.

**Key Implementation Notes**

- **State additions:**
  - `spRoster: Record<string, string>`, `spHumanId: string | null`, `display_order_sp: Record<string, number>`.
  - Ensure reducers and snapshot validation accept the new fields (current validators already allow extra fields but ensure `players`/`scores` are valid).
- **SP logic alignment:**
  - Update any SP‑specific reducers/selectors using `Object.keys(state.players)` to instead use SP roster. Example: trickCounts initialization in `sp/deal` should use `Object.keys(state.spRoster)`.
  - Update `app/single-player/page.tsx` to read players from `selectSpPlayersOrdered(state)` instead of `selectPlayersOrdered(state)`.
- **Remove global seeding:**
  - Delete the “Seed default players” effect in `components/state-provider.tsx` and rely on the SP first‑run modal for SP; Score Card flow keeps manual creation on `/players`.
- **Naming rules (SP):**
  - Human: `Player 1`.
  - Bots: `Bot 1..Bot N-1`.
  - Use stable order: `[human, ...bots]` unless the user reorders seats.

**Acceptance Criteria**

- **Mode separation:**
  - Editing or resetting players in Score Card does not change Single Player, and vice‑versa.
  - Existing saved Score Card games load unchanged after the change.
- **SP first‑run UX:**
  - Navigating to `/single-player` with an empty SP roster opens a modal asking for player count.
  - Confirming seeds one human named `Player 1` plus chosen number of bots named `Bot 1..`.
  - No players are created implicitly on app startup; there is no surprise auto‑seed.
- **Human clarity:**
  - In SP, the human player renders with the suffix “(you)” in all views where names appear.
  - Renaming the human keeps the suffix logic display‑only.
- **Technical correctness:**
  - SP trick counts, ordering, and engine behaviors use `spRoster` exclusively and remain correct for 2–6 players (and >5 triggers two‑deck logic as today).

**Implementation Plan (High‑Level)**

- State and events
  - Add `spRoster`, `spHumanId`, `display_order_sp` to `AppState` and `INITIAL_STATE`.
  - Add SP roster event types and reducers in `lib/state/types.ts`.
  - Update `lib/state/validation.ts` schemas to include new SP events.
- Selectors
  - Add `selectSpPlayersOrdered` (mirror of `selectPlayersOrdered` but for SP) in `lib/state/selectors-sp.ts` or `selectors.ts`.
- Single Player page
  - Switch roster source to SP selectors; update trick counts and any `Object.keys(state.players)` use.
  - Add first‑run modal to `/single-player` that seeds SP roster on confirm.
  - Append “(you)” for `spHumanId` in all SP name helpers.
- Players UI
  - Split management UI into Score Card vs Single Player sections; scope reset buttons accordingly and update copy.
- Clean‑ups
  - Remove global default seeding from `components/state-provider.tsx`.
  - Ensure snapshot validators tolerate the new fields (no change needed if they only assert `players` and `scores`).

**Risks and Mitigations**

- **Risk:** Forgetting to swap a `state.players` reference in SP code could cause mismatched counts or crashes.
  - **Mitigation:** Grep for `state.players` in SP files and add unit tests for 2, 5, and 6‑player SP runs.
- **Risk:** Confusing resets that still look global.
  - **Mitigation:** Clear labels: “Reset Score Card Players” vs “Reset Single Player Roster”. Disable when empty.

**Out‑of‑Scope (for this change)**

- Multiplayer roster and identity; only SP and Score Card are addressed.
- Persisting an authenticated user; “(you)” is local‑session only.
