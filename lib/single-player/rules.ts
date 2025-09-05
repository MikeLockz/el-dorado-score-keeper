import type { Card, Suit } from './types';

export type LegalityContext = Readonly<{
  trump: Suit;
  ledSuit?: Suit; // undefined if leading
  trickHasTrump: boolean;
  hand: readonly Card[];
}>;

export function canLead(card: Card, trump: Suit, hand: readonly Card[]): boolean {
  // Leading restriction: may not lead trump if holding any non-trump card.
  const hasNonTrump = hand.some((c) => c.suit !== trump);
  if (hasNonTrump && card.suit === trump) return false;
  return true;
}

export function isLegalPlay(card: Card, ctx: LegalityContext): boolean {
  const { trump, ledSuit, trickHasTrump, hand } = ctx;

  // Leading the trick
  if (!ledSuit) return canLead(card, trump, hand);

  const canFollow = hand.some((c) => c.suit === ledSuit);
  if (canFollow) return card.suit === ledSuit;

  // Cannot follow led suit.
  if (trickHasTrump) {
    const hasTrump = hand.some((c) => c.suit === trump);
    if (hasTrump) return card.suit === trump; // must play trump if you have it
  }
  // Otherwise any card allowed.
  return true;
}

