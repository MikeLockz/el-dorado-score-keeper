import { describe, it, expect } from 'vitest';
import { roundDelta, finalizeRound, initialRounds } from '@/lib/state/logic';
import type { AppState } from '@/lib/state/types';

describe('logic edge cases', () => {
  describe('roundDelta with negative bids', () => {
    it('allows base to go negative and preserves sign interaction', () => {
      // base = 5 + floor(-6) = -1
      expect(roundDelta(-6, true)).toBe(-1);
      expect(roundDelta(-6, false)).toBe(1);
      // base = 5 + floor(-1.2) = 3
      expect(roundDelta(-1.2, true)).toBe(3);
      expect(roundDelta(-1.2, false)).toBe(-3);
    });
  });

  describe('finalizeRound with missing bids/made', () => {
    it('defaults missing bid to 0 and missing made to false (penalty)', () => {
      const base: AppState = {
        players: { p1: 'Alpha', p2: 'Beta' },
        scores: {},
        rounds: initialRounds(),
      };
      // Round 1 exists but with no bids/made recorded.
      const after = finalizeRound(base, 1);
      // Each player: bid=0, made=false -> delta = -(5 + 0) = -5
      expect(after.scores.p1).toBe(-5);
      expect(after.scores.p2).toBe(-5);
      // Round 1 scored, next round unlocked to bidding
      expect(after.rounds[1].state).toBe('scored');
      expect(after.rounds[2].state).toBe('bidding');
    });
  });
});

