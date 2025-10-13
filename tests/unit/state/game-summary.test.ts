import { describe, expect, it } from 'vitest';

import { summarizeState, resolveSummaryPlayerCount } from '@/lib/state/io';
import { INITIAL_STATE } from '@/lib/state';

describe('game summary player counts', () => {
  it('counts players by unique display names', () => {
    const state = structuredClone(INITIAL_STATE);
    (state as any).players = {
      alpha: 'Player 1',
      beta: 'PLAYER 1', // same name, different casing
      gamma: 'Player 2',
    };

    const summary = summarizeState(state);

    expect(summary.players).toBe(2);
    expect(resolveSummaryPlayerCount(summary)).toBe(2);
  });

  it('falls back to distinct ids when names are blank', () => {
    const state = structuredClone(INITIAL_STATE);
    (state as any).players = {
      alpha: ' ',
      beta: '',
      gamma: '  ',
    };

    const summary = summarizeState(state);

    expect(summary.players).toBe(3);
    expect(resolveSummaryPlayerCount(summary)).toBe(3);
  });
});
