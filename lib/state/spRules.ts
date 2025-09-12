import { tricksForRound } from './logic';

export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type Card = Readonly<{ suit: Suit; rank: number }>;

export type TrickPlay = Readonly<{ playerId: string; card: Card }>;

export type RulesContext = Readonly<{
  order: readonly string[];
  leaderId: string | null;
  trickPlays: readonly TrickPlay[];
  hands: Readonly<Record<string, readonly Card[]>>;
  trump: Suit;
  trumpBroken: boolean;
}>;

export function nextToAct(ctx: RulesContext): string | null {
  const { order, leaderId, trickPlays } = ctx;
  if (order.length === 0) return null;
  const currentLeader = trickPlays[0]?.playerId ?? leaderId;
  if (!currentLeader) return null;
  const idx = order.indexOf(currentLeader);
  if (idx < 0) return null;
  const rotated = [...order.slice(idx), ...order.slice(0, idx)];
  const i = trickPlays.length;
  return i < rotated.length ? rotated[i]! : null;
}

export function isTrickComplete(ctx: RulesContext): boolean {
  return ctx.trickPlays.length >= ctx.order.length && ctx.order.length > 0;
}

export function isRoundDone(
  roundNo: number,
  trickCounts: Readonly<Record<string, number>>,
): boolean {
  const needed = tricksForRound(roundNo);
  const total = Object.values(trickCounts ?? {}).reduce((a, n) => a + (n ?? 0), 0);
  return needed > 0 && total >= needed;
}

export function mustFollowSuit(
  trickPlays: readonly TrickPlay[],
  hand: readonly Card[],
): {
  must: boolean;
  suit?: Suit;
} {
  const ledSuit = trickPlays[0]?.card?.suit;
  if (!ledSuit) return { must: false };
  const hasLed = (hand ?? []).some((c) => c.suit === ledSuit);
  return hasLed ? { must: true, suit: ledSuit } : { must: false };
}

export function canLeadTrump(trump: Suit, hand: readonly Card[], trumpBroken: boolean): boolean {
  if (trumpBroken) return true;
  // If player has any non-trump card, they cannot lead trump until broken
  const hasNonTrump = (hand ?? []).some((c) => c.suit !== trump);
  return !hasNonTrump;
}

export function canPlayCard(
  ctx: RulesContext,
  playerId: string,
  card: Card,
): { ok: boolean; reason?: string } {
  // Must be player's turn
  const expected = nextToAct(ctx);
  if (!expected || expected !== playerId) return { ok: false, reason: 'not-your-turn' };

  // Must own the card
  const hand: readonly Card[] = ctx.hands[playerId] ?? [];
  const hasCard = hand.some((c) => c.suit === card.suit && c.rank === card.rank);
  if (!hasCard) return { ok: false, reason: 'card-not-in-hand' };

  const ledSuit = ctx.trickPlays[0]?.card?.suit;
  if (!ledSuit) {
    // Leading: check trump lead restriction
    if (card.suit === ctx.trump && !canLeadTrump(ctx.trump, hand, ctx.trumpBroken)) {
      return { ok: false, reason: 'cannot-lead-trump' };
    }
    return { ok: true };
  }

  // Following: must follow suit if possible
  const req = mustFollowSuit(ctx.trickPlays, hand);
  if (req.must && card.suit !== req.suit) return { ok: false, reason: 'must-follow-suit' };
  return { ok: true };
}
