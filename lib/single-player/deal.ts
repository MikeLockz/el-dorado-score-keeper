import type { Card, PlayerId, RoundConfig, Suit } from './types';
import { buildShoe, shuffleInPlace, draw } from './deck';
import { mulberry32 } from './rng';

export type DealResult = Readonly<{
  hands: Record<PlayerId, Card[]>;
  trumpCard: Card;
  trump: Suit;
  firstToAct: PlayerId; // first bid + first lead
  deckRemaining: number;
}>;

export function rotateOrder(players: PlayerId[], startIdx: number): PlayerId[] {
  const n = players.length;
  const out: PlayerId[] = [];
  for (let i = 0; i < n; i++) out.push(players[(startIdx + i) % n]!);
  return out;
}

export function startIdxAfterDealer(players: PlayerId[], dealer: PlayerId): number {
  const idx = players.indexOf(dealer);
  if (idx < 0) throw new Error('Dealer not in players');
  return (idx + 1) % players.length;
}

export function dealRound(cfg: RoundConfig, seed: number = Date.now()): DealResult {
  const rng = mulberry32(seed >>> 0);
  const shoe = buildShoe(cfg.useTwoDecks);
  shuffleInPlace(shoe, rng);

  // Dealer deals one card at a time starting with next player.
  const startIdx = startIdxAfterDealer(cfg.players, cfg.dealer);
  const order = rotateOrder(cfg.players, startIdx);

  const hands: Record<PlayerId, Card[]> = Object.fromEntries(
    cfg.players.map((p) => [p, []] as const),
  );
  for (let c = 0; c < cfg.tricks; c++) {
    for (const p of order) {
      const card = draw(shoe);
      if (!card) throw new Error('Deck exhausted during deal');
      hands[p]!.push(card);
    }
  }
  const trumpCard = draw(shoe);
  if (!trumpCard) throw new Error('No trump card available');
  const trump = trumpCard.suit;
  return {
    hands,
    trumpCard,
    trump,
    firstToAct: order[0]!,
    deckRemaining: shoe.length,
  };
}
