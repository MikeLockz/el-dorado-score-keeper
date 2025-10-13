import { describe, it, expect } from 'vitest';

import {
  getCurrentSinglePlayerGameId,
  ensureSinglePlayerGameIdentifiers,
  getActiveScorecardId,
  resolveSinglePlayerRoute,
  resolveScorecardRoute,
  singlePlayerPath,
  scorecardPath,
  resolvePlayerRoute,
  resolveRosterRoute,
  resolveArchivedFilterRoute,
  resolveArchivedGameRoute,
  resolveGameModalRoute,
} from '@/lib/state/utils';
import { INITIAL_STATE } from '@/lib/state';

describe('state utils helpers', () => {
  it('getCurrentSinglePlayerGameId returns trimmed identifier', () => {
    const state = structuredClone(INITIAL_STATE);
    (state as any).sp = {
      ...state.sp,
      currentGameId: ' game-123 ',
    };
    expect(getCurrentSinglePlayerGameId(state)).toBe('game-123');
  });

  it('getCurrentSinglePlayerGameId falls back to legacy gameId field', () => {
    const state = structuredClone(INITIAL_STATE);
    (state as any).sp = {
      ...state.sp,
      gameId: 'legacy-789 ',
    };
    expect(getCurrentSinglePlayerGameId(state)).toBe('legacy-789');
  });

  it('getCurrentSinglePlayerGameId derives identifier from session seed when missing explicit ids', () => {
    const state = structuredClone(INITIAL_STATE);
    (state as any).sp = {
      ...state.sp,
      sessionSeed: 123456789,
    };
    expect(getCurrentSinglePlayerGameId(state)).toBe('sp-21i3v9');
  });

  it('getActiveScorecardId returns trimmed roster id', () => {
    const state = structuredClone(INITIAL_STATE);
    (state as any).activeScorecardRosterId = ' roster-1 ';
    expect(getActiveScorecardId(state)).toBe('roster-1');
  });

  it('getActiveScorecardId returns null for empty strings', () => {
    const state = structuredClone(INITIAL_STATE);
    (state as any).activeScorecardRosterId = '  ';
    expect(getActiveScorecardId(state)).toBeNull();
  });

  it('resolveSinglePlayerRoute returns dynamic segments when game id exists', () => {
    const state = structuredClone(INITIAL_STATE);
    (state as any).sp = {
      ...state.sp,
      currentGameId: 'game-abc',
    };
    expect(resolveSinglePlayerRoute(state)).toBe('/single-player/game-abc');
    expect(resolveSinglePlayerRoute(state, { view: 'scorecard' })).toBe(
      '/single-player/game-abc/scorecard',
    );
    expect(resolveSinglePlayerRoute(state, { view: 'summary' })).toBe(
      '/single-player/game-abc/summary',
    );
  });

  it('resolveSinglePlayerRoute falls back to entry when missing id', () => {
    const state = structuredClone(INITIAL_STATE);
    expect(resolveSinglePlayerRoute(state)).toBe('/single-player/new');
    expect(resolveSinglePlayerRoute(state, { fallback: 'entry' })).toBe('/single-player');
    expect(resolveSinglePlayerRoute(state, { view: 'summary' })).toBe('/single-player');
  });

  it('ensureSinglePlayerGameIdentifiers populates current and legacy ids when derived', () => {
    const state = structuredClone(INITIAL_STATE);
    (state as any).sp = {
      ...state.sp,
      sessionSeed: 1700000000000,
    };
    const next = ensureSinglePlayerGameIdentifiers(state);
    const derived = getCurrentSinglePlayerGameId(state);
    expect(derived).not.toBeNull();
    expect(next.sp).toMatchObject({
      currentGameId: derived!,
      gameId: derived!,
    });
  });

  it('resolveScorecardRoute returns live and summary routes when roster id present', () => {
    const state = structuredClone(INITIAL_STATE);
    (state as any).activeScorecardRosterId = 'score-123';
    expect(resolveScorecardRoute(state)).toBe('/scorecard/score-123');
    expect(resolveScorecardRoute(state, { view: 'summary' })).toBe('/scorecard/score-123/summary');
  });

  it('resolveScorecardRoute falls back to scorecard hub without id', () => {
    const state = structuredClone(INITIAL_STATE);
    expect(resolveScorecardRoute(state)).toBe('/games/scorecards');
    expect(resolveScorecardRoute(state, { view: 'summary' })).toBe('/games/scorecards');
  });

  it('getActiveScorecardId ignores legacy scorecard-default id', () => {
    const state = structuredClone(INITIAL_STATE);
    (state as any).activeScorecardRosterId = 'scorecard-default';
    expect(getActiveScorecardId(state)).toBeNull();
  });

  it('singlePlayerPath builds correct sub-routes and falls back to hub', () => {
    expect(singlePlayerPath('abc')).toBe('/single-player/abc');
    expect(singlePlayerPath('abc', 'scorecard')).toBe('/single-player/abc/scorecard');
    expect(singlePlayerPath('abc', 'summary')).toBe('/single-player/abc/summary');
    expect(singlePlayerPath('')).toBe('/single-player');
  });

  it('scorecardPath builds summary and live paths with graceful fallback', () => {
    expect(scorecardPath('score-7')).toBe('/scorecard/score-7');
    expect(scorecardPath('score-7', 'summary')).toBe('/scorecard/score-7/summary');
    expect(scorecardPath(null, 'summary')).toBe('/games/scorecards');
  });

  it('resolvePlayerRoute handles explicit ids and archived fallbacks', () => {
    expect(resolvePlayerRoute('player-1')).toBe('/players/player-1');
    expect(resolvePlayerRoute(' player-2 ')).toBe('/players/player-2');
    expect(resolvePlayerRoute('player-3', { view: 'statistics' })).toBe(
      '/players/player-3/statistics',
    );
    expect(resolvePlayerRoute('', { archived: true })).toBe('/players/archived');
    expect(resolvePlayerRoute(null, { fallback: 'list' })).toBe('/players');
  });

  it('resolveRosterRoute handles archived and default fallbacks', () => {
    expect(resolveRosterRoute('roster-5')).toBe('/rosters/roster-5');
    expect(resolveRosterRoute(' roster-6 ', { archived: false })).toBe('/rosters/roster-6');
    expect(resolveRosterRoute(undefined, { archived: true })).toBe('/rosters/archived');
    expect(resolveRosterRoute('', { fallback: 'list' })).toBe('/rosters');
  });

  it('resolveArchivedFilterRoute maps entities and views', () => {
    expect(resolveArchivedFilterRoute('players', 'active')).toBe('/players');
    expect(resolveArchivedFilterRoute('players', 'archived')).toBe('/players/archived');
    expect(resolveArchivedFilterRoute('rosters', 'archived')).toBe('/rosters/archived');
    expect(resolveArchivedFilterRoute('rosters', 'active')).toBe('/rosters');
  });

  it('resolveArchivedGameRoute and resolveGameModalRoute normalise ids', () => {
    expect(resolveArchivedGameRoute(' game-9 ')).toBe('/games/game-9');
    expect(resolveArchivedGameRoute(null)).toBe('/games');
    expect(resolveGameModalRoute(' game-9 ', 'restore')).toBe('/games/game-9/restore');
    expect(resolveGameModalRoute(undefined, 'delete')).toBe('/games');
  });
});
