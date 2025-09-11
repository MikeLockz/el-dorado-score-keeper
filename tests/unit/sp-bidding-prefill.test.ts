import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computePrecedingBotBids } from '@/lib/single-player/auto-bid';

describe('computePrecedingBotBids', () => {
  const order = ['a', 'b', 'c', 'human'] as const;
  const humanId = 'human';
  const trump = 'spades' as const;
  const tricks = 5;
  const hands: any = {
    a: [
      { suit: 'spades', rank: 11 },
      { suit: 'hearts', rank: 9 },
    ],
    b: [
      { suit: 'clubs', rank: 10 },
      { suit: 'clubs', rank: 8 },
    ],
    c: [
      { suit: 'diamonds', rank: 12 },
      { suit: 'spades', rank: 2 },
    ],
    human: [],
  };

  beforeEach(() => {
    // Make botBid deterministic
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    (Math.random as any).mockRestore?.();
  });

  it('returns bids for all players before the human and none for the human', () => {
    const pre = computePrecedingBotBids({
      roundNo: 1,
      order: order as any,
      humanId: humanId as any,
      trump: trump as any,
      hands,
      tricks,
      existingBids: {},
    });
    const ids = pre.map((p) => p.playerId);
    expect(ids).toEqual(['a', 'b', 'c']);
    for (const p of pre) {
      expect(typeof p.bid).toBe('number');
      expect(p.bid).toBeGreaterThanOrEqual(0);
      expect(p.bid).toBeLessThanOrEqual(tricks);
    }
  });

  it('skips players who already have bids', () => {
    const pre = computePrecedingBotBids({
      roundNo: 1,
      order: order as any,
      humanId: humanId as any,
      trump: trump as any,
      hands,
      tricks,
      existingBids: { a: 1, c: 2 },
    });
    const ids = pre.map((p) => p.playerId);
    expect(ids).toEqual(['b']);
  });
});
