import { describe, it, expect } from 'vitest';
import { botPlay } from '@/lib/single-player/bots/simple';
import type { Card, PlayerId } from '@/lib/single-player/types';

const C = (suit: 'clubs'|'diamonds'|'hearts'|'spades', rank: number): Card => ({ suit, rank });

describe('bot off-suit behavior: no forced trump', () => {
  it('easy diff can deterministically slough non-trump when off-suit (rng injected)', () => {
    const trump = 'hearts' as const;
    const trickPlays: ReadonlyArray<{ player: PlayerId; card: Card; order: number }> = [
      { player: 'p1', card: C('spades', 10), order: 0 },
    ];
    const hand: readonly Card[] = [C('clubs', 2), C('hearts', 3)]; // cannot follow spades; has trump and non-trump
    // Force the 'duck' path (rng() < 0.7)
    const card = botPlay(
      {
        trump,
        trickPlays,
        hand,
        tricksThisRound: 5,
        seatIndex: 1,
        bidsSoFar: {},
        tricksWonSoFar: {},
        selfId: 'p2',
        trumpBroken: false,
        rng: () => 0.0,
      },
      'easy',
    );
    // With rng=0, bot should choose to slough non-trump instead of being forced to trump
    expect(card.suit).toBe('clubs');
  });

  it('normal diff trumps in off-suit (still allowed), showing choice not rule-enforced', () => {
    const trump = 'hearts' as const;
    const trickPlays: ReadonlyArray<{ player: PlayerId; card: Card; order: number }> = [
      { player: 'p1', card: C('spades', 10), order: 0 },
    ];
    const hand: readonly Card[] = [C('clubs', 2), C('hearts', 3)];
    const card = botPlay(
      {
        trump,
        trickPlays,
        hand,
        tricksThisRound: 5,
        seatIndex: 1,
        bidsSoFar: {},
        tricksWonSoFar: {},
        selfId: 'p2',
        trumpBroken: false,
      },
      'normal',
    );
    expect(card.suit).toBe('hearts');
  });
});
