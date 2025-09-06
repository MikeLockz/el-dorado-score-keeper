import { SUITS } from './ordering';
import type { Card, RNG, Rank } from './types';

export function standardDeck(deckId: 1 | 2 = 1): Card[] {
  const out: Card[] = [];
  for (const suit of SUITS) {
    for (let r = 2; r <= 14; r++) {
      out.push({ suit, rank: r as Rank, deckId });
    }
  }
  return out;
}

export function buildShoe(useTwoDecks: boolean): Card[] {
  return useTwoDecks ? [...standardDeck(1), ...standardDeck(2)] : standardDeck(1);
}

export function shuffleInPlace<T>(arr: T[], rng: RNG): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

export function draw<T>(arr: T[]): T | undefined {
  return arr.pop();
}
