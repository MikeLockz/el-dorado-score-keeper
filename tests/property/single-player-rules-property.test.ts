import { describe, it, expect } from 'vitest';
import { isLegalPlay } from '@/lib/single-player/rules';

type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
type Card = { suit: Suit; rank: number };

// Simple deterministic PRNG (mulberry32)
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randSuit(rng: () => number): Suit {
  const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
  return suits[Math.floor(rng() * suits.length)]!;
}

function randRank(rng: () => number): number {
  return 2 + Math.floor(rng() * 13); // 2..14
}

function card(suit: Suit, rank: number): Card {
  return { suit, rank };
}

describe('property: isLegalPlay follow/off-suit', () => {
  it('enforces follow when able; allows any card when unable (off-suit)', () => {
    const rng = mulberry32(0xc0ffee);
    for (let i = 0; i < 200; i++) {
      const trump = randSuit(rng);
      const ledSuit = randSuit(rng);
      const handSize = 1 + Math.floor(rng() * 8); // 1..8
      const hand: Card[] = [];
      for (let k = 0; k < handSize; k++) hand.push(card(randSuit(rng), randRank(rng)));

      const canFollow = hand.some((c) => c.suit === ledSuit);
      if (canFollow) {
        for (const c of hand) {
          const legal = isLegalPlay(c, {
            trump,
            ledSuit,
            trickHasTrump: rng() < 0.5,
            hand,
            trumpBroken: rng() < 0.5,
          });
          if (c.suit === ledSuit) expect(legal).toBe(true);
          else expect(legal).toBe(false);
        }
      } else {
        // Off-suit: any card from hand is legal regardless of trickHasTrump
        for (const c of hand) {
          const legal = isLegalPlay(c, {
            trump,
            ledSuit,
            trickHasTrump: rng() < 0.5,
            hand,
            trumpBroken: rng() < 0.5,
          });
          expect(legal).toBe(true);
        }
      }
    }
  });
});
