# Multiplayer Dealer & Hidden Info — El Dorado

This document defines how dealing, dealer rotation, and private information are handled in the MVP.

## Dealer Responsibilities

- Origin of cards: The current dealer originates the deal for the round.
- Private hand delivery: Dealer sends `private{kind:'hand'}` messages to each player with their hand for the round.
- Timing: Hand messages are sent immediately after the public `sp/deal` event is broadcast.

## Public Signals

- `sp/deal` (broadcast by host) includes:
  - `roundNo`, `dealerId`, `order` (seating), `trump`, `trumpCard`, and any fields required by existing single‑player types.
- Dealer rotation event:
  - Implicit in `sp/deal.dealerId`. No separate event required in MVP.

## Privacy Model (MVP)

- Trust model: Players trust the current dealer to send correct hands privately; no encryption or commit‑reveal.
- Spectators: Not supported in MVP. If added later, they must not receive private hands.
- Snapshots: If a donor includes hands in a snapshot, recipients may learn private info; in MVP we accept this risk for simplicity.

## Hand Message Shape (example)

```
type: "private"
payload: {
  to: "playerId",
  kind: "hand",
  data: { cards: Array<{ suit: 'clubs'|'diamonds'|'hearts'|'spades', rank: number }> }
}
```

## Validation

- The host validates plays and scoring using public events and known rules.
- The host does not need to inspect private hands; legality of plays is inferred from sequences as in single‑player.

## Future Upgrades (non‑MVP)

- Commit–reveal shuffles (mental poker) to reduce trust in the dealer.
- Server‑dealt hands (ephemeral, not persisted) to centralize dealing without long‑term state.
- Encrypted private messages with shared keys per recipient.
