import { describe, expect, it } from 'vitest';
import { hasInProgressGame } from '@/lib/game-flow';
import { INITIAL_STATE } from '@/lib/state/types';
import type { AppState } from '@/lib/state/types';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

function cloneState(): Mutable<AppState> {
  return JSON.parse(JSON.stringify(INITIAL_STATE)) as Mutable<AppState>;
}

describe('hasInProgressGame', () => {
  it('returns false for a fresh state', () => {
    const state = cloneState();
    expect(hasInProgressGame(state)).toBe(false);
  });

  it('returns true when any score is non-zero', () => {
    const state = cloneState();
    state.players = { a: 'Alice' } as AppState['players'];
    state.scores = { a: 10 } as AppState['scores'];
    expect(hasInProgressGame(state)).toBe(true);
  });

  it('returns true when bids exist on an unlocked round', () => {
    const state = cloneState();
    state.rounds[1] = {
      ...state.rounds[1],
      state: 'bidding',
      bids: { a: 3 },
      made: { a: null },
      present: {},
    };
    expect(hasInProgressGame(state)).toBe(true);
  });

  it('returns true when made markers are present', () => {
    const state = cloneState();
    state.rounds[1] = {
      ...state.rounds[1],
      state: 'playing',
      bids: {},
      made: { a: true },
      present: {},
    };
    expect(hasInProgressGame(state)).toBe(true);
  });

  it('returns false for locked rounds with zero bids/made', () => {
    const state = cloneState();
    state.rounds[1] = {
      ...state.rounds[1],
      state: 'locked',
      bids: { a: 0 },
      made: { a: null },
      present: {},
    };
    expect(hasInProgressGame(state)).toBe(false);
  });

  it('returns true for active single-player phases', () => {
    const state = cloneState();
    state.sp = {
      ...state.sp,
      phase: 'playing',
      trickPlays: [{ playerId: 'a', card: { suit: 'hearts', rank: 10 } }],
    };
    expect(hasInProgressGame(state)).toBe(true);
  });

  it('returns false for single-player game-summary', () => {
    const state = cloneState();
    state.sp = {
      ...state.sp,
      phase: 'game-summary',
      trickPlays: [],
      hands: {},
    };
    expect(hasInProgressGame(state)).toBe(false);
  });
});
