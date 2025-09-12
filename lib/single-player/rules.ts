import type { Card, Suit } from './types';

export type LegalityContext = Readonly<{
  trump: Suit;
  ledSuit?: Suit; // undefined if leading
  trickHasTrump: boolean;
  hand: readonly Card[];
  trumpBroken?: boolean; // once trump has been played off-suit earlier this round
}>;

export function canLead(
  card: Card,
  trump: Suit,
  hand: readonly Card[],
  trumpBroken?: boolean,
): boolean {
  // Leading restriction: may not lead trump if holding any non-trump card,
  // unless trump has been "broken" earlier this round.
  if (!trumpBroken) {
    const hasNonTrump = hand.some((c) => c.suit !== trump);
    if (hasNonTrump && card.suit === trump) return false;
  }
  return true;
}

export function isLegalPlay(card: Card, ctx: LegalityContext): boolean {
  const { trump, ledSuit, hand } = ctx;

  // Leading the trick
  if (!ledSuit) return canLead(card, trump, hand, ctx.trumpBroken);

  const canFollow = hand.some((c) => c.suit === ledSuit);
  if (canFollow) return card.suit === ledSuit;

  // Cannot follow the led suit: any card is allowed.
  return true;
}
