import type { Card, Rank, Suit } from './types';

export const RANKS_DESC: Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
export const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

export function compareRanks(a: Rank, b: Rank): number {
  return a === b ? 0 : a > b ? 1 : -1;
}

export function isTrump(card: Card, trump: Suit): boolean {
  return card.suit === trump;
}

export function sameFace(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

