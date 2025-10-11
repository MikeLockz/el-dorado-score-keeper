import { describe, it, expect } from 'vitest';

import { deriveGameMode, deriveGameRoute, type GameRecord } from '@/lib/state/io';
import { getActiveScorecardId, getCurrentSinglePlayerGameId } from '@/lib/state/utils';
import { INITIAL_STATE } from '@/lib/state';

describe('route helper utilities', () => {
  const makeGameRecord = (mode: 'single-player' | 'scorecard'): GameRecord => ({
    id: `game-${mode}`,
    title: 'Archived Game',
    createdAt: Date.now() - 1_000,
    finishedAt: Date.now(),
    lastSeq: 4,
    summary: {
      players: 2,
      scores: { a: 5, b: 3 },
      playersById: { a: 'Alice', b: 'Bob' },
      winnerId: 'a',
      winnerName: 'Alice',
      winnerScore: 5,
      mode,
      scorecard: { activeRound: null },
      sp:
        mode === 'single-player'
          ? {
              phase: 'playing',
              roundNo: 1,
              dealerId: 'a',
              leaderId: 'b',
              order: ['a', 'b'],
              trump: 'hearts',
              trumpCard: { suit: 'hearts', rank: 10 },
              trickCounts: {},
              trumpBroken: false,
            }
          : undefined,
    },
    bundle: { latestSeq: 4, events: [] },
  });

  it('derives game mode and route from archived records', () => {
    const single = makeGameRecord('single-player');
    const scorecard = makeGameRecord('scorecard');

    expect(deriveGameMode(single)).toBe('single-player');
    expect(deriveGameRoute(single)).toBe('/single-player/game-single-player');

    expect(deriveGameMode(scorecard)).toBe('scorecard');
    expect(deriveGameRoute(scorecard)).toBe('/scorecard/game-scorecard');
  });

  it('extracts current single-player game id from state snapshots', () => {
    const state = structuredClone(INITIAL_STATE);
    (state as any).sp = { ...state.sp, currentGameId: ' current-777 ' };
    expect(getCurrentSinglePlayerGameId(state)).toBe('current-777');
  });

  it('extracts active scorecard roster id from state snapshots', () => {
    const state = structuredClone(INITIAL_STATE);
    (state as any).activeScorecardRosterId = ' roster-5 ';
    expect(getActiveScorecardId(state)).toBe('roster-5');
  });
});
