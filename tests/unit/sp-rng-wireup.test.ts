import { describe, it, expect, vi } from 'vitest';
import { mulberry32 } from '@/lib/single-player';
import * as autoBid from '@/lib/single-player/auto-bid';
import { prefillPrecedingBotBids } from '@/lib/single-player/engine';
import { INITIAL_STATE } from '@/lib/state';

describe('mulberry32 RNG and SP wiring', () => {
  it('produces deterministic sequences for the same seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
    // Different seed should differ at some position
    const c = mulberry32(124);
    const seqC = Array.from({ length: 5 }, () => c());
    expect(seqC).not.toEqual(seqA);
  });

  it('plumbs rng into bidding prefill for bots', () => {
    const captured: number[] = [];
    const spy = vi.spyOn(autoBid, 'computePrecedingBotBids').mockImplementation((args: any) => {
      if (typeof args?.rng === 'function') {
        captured.push(args.rng());
        captured.push(args.rng());
        captured.push(args.rng());
      }
      return [] as Array<{ playerId: string; bid: number }>;
    });
    const seed = 987654;
    const rng = mulberry32(seed);
    const state = {
      ...INITIAL_STATE,
      sp: {
        ...INITIAL_STATE.sp,
        phase: 'bidding',
        roundNo: 1,
        dealerId: 'a',
        order: ['a', 'b', 'c'],
        trump: 'hearts',
        trumpCard: { suit: 'hearts', rank: 10 },
        hands: {
          a: [
            { suit: 'hearts', rank: 2 },
            { suit: 'clubs', rank: 3 },
          ],
          b: [
            { suit: 'hearts', rank: 4 },
            { suit: 'spades', rank: 5 },
          ],
          c: [
            { suit: 'diamonds', rank: 6 },
            { suit: 'clubs', rank: 7 },
          ],
        },
      },
      rounds: {
        ...INITIAL_STATE.rounds,
        1: { ...INITIAL_STATE.rounds[1]!, state: 'bidding', bids: {}, made: {} },
      },
      players: { a: 'A', b: 'B', c: 'C' },
    } as typeof INITIAL_STATE;

    // Human is 'c'; preceding bots are 'a' and 'b'
    const out = prefillPrecedingBotBids(state as any, 1, 'c', rng);
    expect(Array.isArray(out)).toBe(true);
    // Our mock pulled 3 rng samples; verify they match a fresh rng with same seed
    const check = mulberry32(seed);
    expect(captured).toEqual([check(), check(), check()]);
    spy.mockRestore();
  });
});
