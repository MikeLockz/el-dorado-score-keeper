import { describe, it, expect } from 'vitest';
import { finalizeRound, initialRounds } from '@/lib/state/logic';
import type { AppState, RoundData } from '@/lib/state/types';
import { selectIsGameComplete } from '@/lib/state/selectors';

describe('finalizeRound additional scenarios', () => {
  it('handles mixed missing and explicit made values across players', () => {
    const base: AppState = {
      players: { p1: 'A', p2: 'B', p3: 'C', p4: 'D' },
      scores: { p1: 0, p2: 0, p3: 0, p4: 0 },
      rounds: initialRounds(),
    };
    // Craft a round with diverse inputs
    const r1: RoundData = {
      state: 'complete',
      bids: { p1: 0, p2: 3, p3: 2 }, // p4 missing -> 0
      // Note: include a null explicitly for p3 to ensure it defaults to 0 delta
      made: { p1: true, p2: false, p3: null },
    };
    const withRound: AppState = { ...base, rounds: { ...base.rounds, 1: r1 } };
    const after = finalizeRound(withRound, 1);
    // p1: bid 0, made true => +5
    expect(after.scores.p1).toBe(5);
    // p2: bid 3, made false => -(5+3) = -8
    expect(after.scores.p2).toBe(-8);
    // p3: bid 2, made null => treated as false in finalizeRound => -7
    expect(after.scores.p3).toBe(-7);
    // p4: bid missing -> 0, made missing -> false => -5
    expect(after.scores.p4).toBe(-5);
    // State transitions
    expect(after.rounds[1].state).toBe('scored');
    expect(after.rounds[2].state).toBe('bidding');
  });

  it('final round does not unlock a next round and can complete the game', () => {
    // Prepare state with rounds 1..9 already scored
    const rounds = initialRounds();
    for (let r = 1; r <= 9; r++) {
      rounds[r] = { state: 'scored', bids: {}, made: {} };
    }
    // Add players so finalize applies per-player defaults
    const s: AppState = { players: { p: 'Solo' }, scores: {}, rounds };
    const after = finalizeRound(s, 10);
    // Round 10 scored, but there is no round 11 to unlock
    expect(after.rounds[10].state).toBe('scored');
    expect(after.rounds[11 as any]).toBeUndefined();
    // With 1..9 already scored, game is now complete
    expect(selectIsGameComplete(after)).toBe(true);
  });
});
