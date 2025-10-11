import { describe, expect, it } from 'vitest';
import {
  INITIAL_STATE,
  type AppState,
  selectSinglePlayerGame,
  selectScorecardById,
  selectPlayerById,
  selectRosterById,
} from '@/lib/state';

function cloneState(): AppState {
  return structuredClone(INITIAL_STATE);
}

describe('entity selectors', () => {
  it('returns single-player slice when id matches current game', () => {
    const state = cloneState();
    const spState = {
      ...state.sp,
      currentGameId: 'game-123',
      gameId: 'game-123',
    } as AppState['sp'];
    const next: AppState = { ...state, sp: spState, activeSingleRosterId: 'roster-1' };
    const result = selectSinglePlayerGame(next, 'game-123');
    expect(result).toEqual({ id: 'game-123', sp: spState, rosterId: 'roster-1' });
    expect(selectSinglePlayerGame(next, 'game-999')).toBeNull();
  });

  it('resolves scorecard roster sessions by id', () => {
    const state = cloneState();
    const roster = {
      name: 'League Night',
      playersById: { a: 'A' },
      playerTypesById: { a: 'human' },
      displayOrder: { a: 0 },
      type: 'scorecard' as const,
      createdAt: Date.now(),
      archivedAt: null,
    };
    const next: AppState = {
      ...state,
      rosters: { ...state.rosters, sc1: roster },
      activeScorecardRosterId: 'sc1',
    };
    const result = selectScorecardById(next, 'sc1');
    expect(result).toEqual({ id: 'sc1', roster, archived: false });
    expect(selectScorecardById(next, 'missing')).toBeNull();
  });

  it('returns player lookup including archived flag', () => {
    const state = cloneState();
    const detail = {
      name: 'Jordan',
      type: 'human' as const,
      archived: true,
      archivedAt: 123,
      createdAt: 1,
      updatedAt: 2,
    };
    const next: AppState = {
      ...state,
      players: { ...state.players, p1: 'Jordan' },
      playerDetails: { ...state.playerDetails, p1: detail },
    };
    const result = selectPlayerById(next, 'p1');
    expect(result).toEqual({ id: 'p1', name: 'Jordan', detail, archived: true });
    expect(selectPlayerById(next, 'missing')).toBeNull();
  });

  it('returns roster lookup including archived flag', () => {
    const state = cloneState();
    const roster = {
      name: 'Single Squad',
      playersById: {},
      playerTypesById: {},
      displayOrder: {},
      type: 'single' as const,
      createdAt: Date.now(),
      archivedAt: 42,
    };
    const next: AppState = {
      ...state,
      rosters: { ...state.rosters, r1: roster },
    };
    const result = selectRosterById(next, 'r1');
    expect(result).toEqual({ id: 'r1', roster, archived: true });
  });
});
