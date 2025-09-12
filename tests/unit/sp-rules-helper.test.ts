import { describe, it, expect } from 'vitest';
import {
  canLeadTrump,
  canPlayCard,
  isRoundDone,
  isTrickComplete,
  mustFollowSuit,
  nextToAct,
  type Card,
  type RulesContext,
} from '@/lib/state/spRules';

const mk = (suit: Card['suit'], rank: number): Card => ({ suit, rank });

const baseCtx = (): RulesContext => ({
  order: ['A', 'B', 'C', 'D'],
  leaderId: 'A',
  trickPlays: [],
  hands: {
    A: [mk('hearts', 10), mk('spades', 12)],
    B: [mk('hearts', 2), mk('clubs', 5)],
    C: [mk('diamonds', 8), mk('spades', 3)],
    D: [mk('hearts', 9), mk('diamonds', 9)],
  },
  trump: 'spades',
  trumpBroken: false,
});

describe('spRules helpers (pure)', () => {
  it('nextToAct rotates from leader and advances by trickPlays length', () => {
    const ctx = baseCtx();
    expect(nextToAct(ctx)).toBe('A');
    const ctx2 = { ...ctx, trickPlays: [{ playerId: 'A', card: mk('hearts', 10) }] };
    expect(nextToAct(ctx2)).toBe('B');
  });

  it('mustFollowSuit requires card of led suit if present', () => {
    const ctx = baseCtx();
    const handB = ctx.hands.B!;
    const plays = [{ playerId: 'A', card: mk('hearts', 10) }];
    const req = mustFollowSuit(plays, handB);
    expect(req.must).toBe(true);
    expect(req.suit).toBe('hearts');
  });

  it('mustFollowSuit is false when hand lacks led suit', () => {
    const ctx = baseCtx();
    const handC = ctx.hands.C!; // C has diamonds/spades, led hearts
    const plays = [{ playerId: 'A', card: mk('hearts', 10) }];
    const req = mustFollowSuit(plays, handC);
    expect(req.must).toBe(false);
  });

  it('canLeadTrump disallows leading trump with non-trump in hand until broken', () => {
    const ctx = baseCtx();
    const handA = ctx.hands.A!; // hearts, spades
    expect(canLeadTrump(ctx.trump, handA, false)).toBe(false);
    expect(canLeadTrump(ctx.trump, handA, true)).toBe(true);
    // If only trump in hand, allowed even if not broken
    const onlyTrump = [mk('spades', 5), mk('spades', 7)];
    expect(canLeadTrump('spades', onlyTrump, false)).toBe(true);
  });

  it('canPlayCard enforces turn order and follow-suit', () => {
    const ctx = baseCtx();
    // A to act, tries to play spade lead (trump not broken, has hearts as non-trump) -> disallowed
    expect(canPlayCard(ctx, 'A', mk('spades', 12))).toEqual({
      ok: false,
      reason: 'cannot-lead-trump',
    });
    // A leads hearts -> ok
    const lead = canPlayCard(ctx, 'A', mk('hearts', 10));
    expect(lead.ok).toBe(true);
    const ctx2: RulesContext = { ...ctx, trickPlays: [{ playerId: 'A', card: mk('hearts', 10) }] };
    // B must follow hearts if possible; B has hearts -> cannot play clubs
    expect(canPlayCard(ctx2, 'B', mk('clubs', 5))).toEqual({
      ok: false,
      reason: 'must-follow-suit',
    });
    // B plays hearts -> ok
    expect(canPlayCard(ctx2, 'B', mk('hearts', 2)).ok).toBe(true);
    // C off-suit allowed if no hearts
    const ctx3: RulesContext = {
      ...ctx2,
      trickPlays: [...ctx2.trickPlays, { playerId: 'B', card: mk('hearts', 2) }],
    };
    expect(canPlayCard(ctx3, 'C', mk('diamonds', 8)).ok).toBe(true);
    // Not your turn
    expect(canPlayCard(ctx, 'B', mk('hearts', 2))).toEqual({ ok: false, reason: 'not-your-turn' });
  });

  it('isTrickComplete detects when plays length equals order size', () => {
    const ctx = baseCtx();
    expect(isTrickComplete(ctx)).toBe(false);
    const done: RulesContext = {
      ...ctx,
      trickPlays: [
        { playerId: 'A', card: mk('hearts', 10) },
        { playerId: 'B', card: mk('hearts', 2) },
        { playerId: 'C', card: mk('diamonds', 8) },
        { playerId: 'D', card: mk('hearts', 9) },
      ],
    };
    expect(isTrickComplete(done)).toBe(true);
  });

  it('isRoundDone compares trickCounts sum to schedule', () => {
    // round 10 -> 1 trick
    expect(isRoundDone(10, { A: 1, B: 0 })).toBe(true);
    expect(isRoundDone(10, { A: 0, B: 0 })).toBe(false);
    // round 6 -> 5
    expect(isRoundDone(6, { A: 2, B: 3 })).toBe(true);
  });
});
