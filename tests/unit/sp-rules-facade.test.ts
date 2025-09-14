import { describe, it, expect } from 'vitest';
import { canPlayCard } from '@/lib/rules/sp';

describe('SP Rules Facade: canPlayCard', () => {
  const baseCtx = {
    order: ['a', 'b', 'c'] as const,
    leaderId: 'a',
    trickPlays: [] as ReadonlyArray<{ playerId: string; card: { suit: any; rank: number } }>,
    hands: {
      a: [
        { suit: 'clubs', rank: 2 },
        { suit: 'hearts', rank: 3 },
        { suit: 'spades', rank: 4 },
      ],
      b: [],
      c: [],
    } as Record<string, ReadonlyArray<{ suit: any; rank: number }>>,
    trump: 'spades' as const,
    trumpBroken: false,
  };

  it('disallows leading trump if not broken and a non-trump exists', () => {
    const ctx = { ...baseCtx };
    // Use a trump card that is actually in hand
    const out = canPlayCard(ctx, 'a', { suit: 'spades', rank: 4 });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('cannot-lead-trump');
  });

  it('requires following suit when possible; otherwise allows any card', () => {
    const ctx = {
      ...baseCtx,
      trickPlays: [{ playerId: 'a', card: { suit: 'hearts', rank: 10 } }],
      leaderId: 'a',
    };
    // Player b has a hearts to follow
    const ctxWithHands = {
      ...ctx,
      hands: {
        ...baseCtx.hands,
        b: [
          { suit: 'hearts', rank: 2 },
          { suit: 'clubs', rank: 5 },
        ],
      },
    };
    const bad = canPlayCard(ctxWithHands, 'b', { suit: 'clubs', rank: 5 });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe('must-follow-suit');
    const good = canPlayCard(ctxWithHands, 'b', { suit: 'hearts', rank: 2 });
    expect(good.ok).toBe(true);

    // If player b cannot follow, any card is allowed
    const ctxNoHearts = {
      ...ctx,
      hands: {
        ...baseCtx.hands,
        b: [
          { suit: 'clubs', rank: 9 },
          { suit: 'clubs', rank: 5 },
        ],
      },
    };
    const any = canPlayCard(ctxNoHearts, 'b', { suit: 'clubs', rank: 9 });
    expect(any.ok).toBe(true);
  });
});
