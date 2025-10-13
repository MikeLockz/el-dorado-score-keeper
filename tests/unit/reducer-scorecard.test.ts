import { describe, it, expect } from 'vitest';

import { INITIAL_STATE, reduce, events } from '@/lib/state';

describe('scorecard roster seeding', () => {
  it('creates a non-default scorecard roster id when players are added', () => {
    const add = events.playerAdded({ id: 'p1', name: 'Player 1' });
    const state = reduce(INITIAL_STATE, add);
    expect(state.activeScorecardRosterId).toBeTruthy();
    expect(state.activeScorecardRosterId).not.toBe('scorecard-default');
    const rosterId = state.activeScorecardRosterId!;
    expect(state.rosters[rosterId]).toBeDefined();
    expect(state.rosters[rosterId]?.type).toBe('scorecard');
  });
});
