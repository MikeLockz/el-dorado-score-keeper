import { describe, it, expect } from 'vitest';
import { selectSpNextToPlay, type AppState, INITIAL_STATE } from '@/lib/state';

function withPhase(phase: 'setup' | 'bidding' | 'playing' | 'done'): AppState {
  return {
    ...INITIAL_STATE,
    sp: {
      ...INITIAL_STATE.sp,
      phase,
      order: ['p1', 'p2', 'p3'],
      leaderId: 'p1',
      trickPlays: [],
    },
  } as AppState;
}

describe('selectSpNextToPlay', () => {
  it('returns null when phase is setup', () => {
    const s = withPhase('setup');
    expect(selectSpNextToPlay(s)).toBeNull();
  });

  it('returns null when phase is bidding', () => {
    const s = withPhase('bidding');
    expect(selectSpNextToPlay(s)).toBeNull();
  });

  it('returns null when phase is done', () => {
    const s = withPhase('done');
    expect(selectSpNextToPlay(s)).toBeNull();
  });
});

