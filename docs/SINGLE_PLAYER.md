# Single Player Mode — El Dorado

This document is the implementation plan to add a single‑player, interactive mode (human vs. virtual players) while preserving the existing score‑keeping rules and UI. The current score system (±[5 + bid] based on whether the player exactly made their bid) remains the source of truth.

## Summary

- Add a self‑contained single‑player engine (cards, dealing, bidding, trick play, scoring integration) and a minimal UI at `app/single-player/`.
- Support 2–10 players; when players > 5, use two standard 52‑card decks shuffled together.
- Play 10 rounds: tricks per round 10 → 1 (uses existing `tricksForRound`).
- Enforce the specified dealing, trump, bidding, and play rules; rotate dealer each round.
- Integrate results with existing app state: record bids and whether each player “made” exactly; scoring stays unchanged.

## Rules To Implement

- Players: 2–10. Hidden information: players never see others’ hands.
- Rounds: 10 total; round r deals `tricksForRound(r)` cards to each player (10,9,...,1).
- Deck(s):
  - ≤ 5 players → 1 deck (52 cards).
  - ≥ 6 players → 2 decks combined (104 cards).
  - Freshly shuffle each round; do not carry cards between rounds.
- Dealing & Trump:
  - Dealer deals 1 card at a time, starting with the next player and going around the table until each has the required count.
  - Flip the next card in the deck face up to set the trump suit for the round.
- Bidding:
  - First bid is from the first player dealt to (left of dealer), then proceed in table order; dealer bids last.
  - This is the same order as who leads the first trick (the player after the dealer leads first).
  - Each bid is an integer from 0 to the number of tricks for that round (inclusive).
  - No additional sum‑of‑bids restriction.
- Trick Play:
  - The player who bids first (the player after the dealer) leads the first trick; trick winners lead subsequent tricks.
  - Leading restriction: a player may lead any suit except trump if they hold at least one non-trump card.
  - Breaking trump: once a trump card has been played off-suit (i.e., not led) because a player could not follow the led suit (or only had trump remaining), trump is considered "broken" and may be led on subsequent tricks of the same round.
  - Following:
    - Players must follow the led suit if able.
    - If unable to follow the led suit, they may play any card.
  - Trick resolution:
    - Highest rank of the led suit wins unless any trump is present, in which case highest trump wins.
    - Rank order: A > K > Q > J > 10 ... > 2.
    - If identical cards appear (possible with two decks), the earlier played card wins.
- Scoring (unchanged):
  - If a player’s tricks won equals their bid → score +[5 + bid].
  - Otherwise → score −[5 + bid].
  - Note: This preserves the current app logic; it is not “−5 per trick off”.
- Dealer Rotation: Dealer advances to the next player each round.
- Game End: After 10 rounds, highest score wins; ties allowed.

## Clarifications and Assumptions

- Trump lead restriction applies only when leading a trick (not when following or sloughing).
- Aces are high. No jokers. No special bonuses.
- Fresh shuffle each round guarantees a trump card exists to flip (deck size always exceeds total dealt by 1 under the deck rules).
- With two decks, suits/ranks duplicate; first‑played tie breaker decides trick winner.

## Architecture

- Core engine lives under `lib/single-player/` (no changes to existing scorekeeper modules unless listed under Integration).
  - `types.ts`: Card, Suit, Rank, PlayerId, Trick, Bid, RoundConfig, RNG, etc.
  - `rng.ts`: Seedable PRNG (e.g., mulberry32/xoroshiro128+) to support replay/debug.
  - `deck.ts`: Build and shuffle one or two decks; combine into a shoe; draw API.
  - `ordering.ts`: Rank comparisons; suit/trump helpers.
  - `deal.ts`: Player order, dealer rotation, 1‑at‑a‑time deal, trump flip.
  - `bidding.ts`: Turn order, validation (0..tricks), collect bids; emits bid events.
  - `rules.ts`: Legal move validator per trick, including trump and follow rules.
  - `trick.ts`: Play a trick, validate plays, determine winner (with first‑play tie break).
  - `round.ts`: Orchestrate N tricks, track tricks‑won per player, determine “made”.
  - `game.ts`: 10‑round lifecycle; seat management; dealer rotation; summary extraction.
  - `bots/`: Bid and play policies; difficulty presets.
- UI in `app/single-player/`:
  - `page.tsx`: Lobby to configure game (players count up to 10, human seat, bot difficulty, seed).
  - `game.tsx`: In‑round view: your hand, current trick, trump indicator, bids, trick counts, whose turn, and play controls; others’ hands hidden.
  - Minimal accessibility: clear turn prompts; keyboard play for hand; readable trick history.

## Integration with Existing State

- Source of truth for scores remains `lib/state`:
  - For each round, write the players’ bids via `events.bidSet`.
  - After the round completes, compute whether the player exactly made their bid; write `events.madeSet` for each.
  - Finalize round with `events.roundFinalize` to calculate scores using existing `roundDelta`.
- Single‑player keeps its own ephemeral runtime state (hands, deck, trick history); only deltas needed by the scorekeeper are persisted via events.
- No breaking changes to existing selectors, reducers, or views.

## Virtual Players (Bots)

- Bidding baseline:
  - Estimate trick potential from hand: count high cards in long suits; adjust for trump length/high ranks; reduce when seats earlier.
  - Clamp to [0..tricks] and add a small randomness based on difficulty and position.
- Play baseline:
  - Follow suit highest to win when advantageous to meet bid; otherwise lowest to conserve winners.
  - If off‑suit: prefer non‑trump unless needing to secure a trick; consider trumping in based on difficulty/heuristics; choose minimal trump that wins if needed.
- Difficulties:
  - Easy: +random noise, conservative bidding, straightforward play.
  - Normal: heuristic as above.
  - Hard: improved suit inference from prior plays, trump management, endgame awareness.

## Persistence & Reproducibility

- Seedable RNG in the engine; persist seed with game setup for reproducible runs.
- Optionally log compact per‑trick history to a debug panel (not stored in scorekeeper state).

## Validation & Tests

- Unit tests (Vitest) under `tests/single-player/`:
  - Dealing counts with 1 or 2 decks; trump flip present.
  - Legal move validator: follow suit; no leading trump when holding non‑trump; off‑suit trump requirement.
  - Trick resolution: rank order; trump dominance; duplicate card tie → first wins.
  - Round orchestration: trick‑count per player sums to tricks; “made” detection matches bids.
  - Scoring integration: events emitted align with `roundDelta` outcomes.
- Property tests with fixed seeds to check invariants across random deals.

## Phased Delivery

1. Engine core (types, deck, ordering, rules, trick, round) with CLI/dev harness.
2. Bots (Normal difficulty) + made/bid extraction.

- Bots accept an injected RNG for deterministic runs in tests; defaults to `Math.random` in UI.

3. UI scaffolding: lobby + in‑game view; wire to engine; event integration.
4. Additional bot difficulties; polish UX; accessibility; tests.

## Open Questions (Proposed Defaults)

- Simultaneous highest cards from two decks: first played wins (default).
- Mid‑hand saving/resume: out of scope initially.

## Non‑Goals (for this iteration)

- Networked multiplayer.
- Spectator view.
- Advanced analytics beyond existing summaries.

## Risks & Mitigations

- Rule ambiguities: capture in tests and document assumptions above.
- Bot strength: start simple; expose difficulty; iterate based on playtesting.
- Integration drift: isolate engine; persist only existing events to avoid reducer changes.

---

Implementation will keep the scorekeeper stable while adding a new, optional single‑player path with clear boundaries between runtime game logic and persisted scoring data.
