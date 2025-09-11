import { describe, it, expect } from 'vitest';
import { isLegalPlay, canLead } from '@/lib/single-player/rules';

const C = (suit: 'clubs'|'diamonds'|'hearts'|'spades', rank: number) => ({ suit, rank });

describe('single-player rules: legality', () => {
  it('leading: cannot lead trump if holding any non-trump and trump not broken', () => {
    const trump = 'spades' as const;
    const hand = [C('spades', 10), C('hearts', 2)];
    expect(canLead(C('spades', 10), trump, hand, false)).toBe(false);
    expect(canLead(C('hearts', 2), trump, hand, false)).toBe(true);
    // Once trump is broken, leading trump is allowed
    expect(canLead(C('spades', 10), trump, hand, true)).toBe(true);
  });

  it('following: must follow led suit when able', () => {
    const trump = 'hearts' as const;
    const ledSuit = 'clubs' as const;
    const hand = [C('clubs', 4), C('spades', 7)];
    // Following led suit is legal; off-suit is not when can follow
    expect(
      isLegalPlay(C('clubs', 4), {
        trump,
        ledSuit,
        trickHasTrump: false,
        hand,
        trumpBroken: false,
      }),
    ).toBe(true);
    expect(
      isLegalPlay(C('spades', 7), {
        trump,
        ledSuit,
        trickHasTrump: false,
        hand,
        trumpBroken: false,
      }),
    ).toBe(false);
  });

  it('off-suit: if cannot follow, any card is allowed (no forced trump)', () => {
    const trump = 'diamonds' as const;
    const ledSuit = 'spades' as const;
    const hand = [C('hearts', 9), C('diamonds', 3)];
    // Even if trick already has trump and we hold trump, any card is allowed
    expect(
      isLegalPlay(C('hearts', 9), {
        trump,
        ledSuit,
        trickHasTrump: true,
        hand,
        trumpBroken: false,
      }),
    ).toBe(true);
    expect(
      isLegalPlay(C('diamonds', 3), {
        trump,
        ledSuit,
        trickHasTrump: true,
        hand,
        trumpBroken: false,
      }),
    ).toBe(true);
  });
});

