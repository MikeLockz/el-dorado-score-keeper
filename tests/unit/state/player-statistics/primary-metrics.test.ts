import { describe, expect, it, beforeEach, vi } from 'vitest';

import { loadPlayerStatisticsSummary, resetPlayerStatisticsCache } from '@/lib/state';
import type { AppState } from '@/lib/state';
import { INITIAL_STATE } from '@/lib/state';
import type { GameRecord } from '@/lib/state/io';

const ioModule = await import('@/lib/state/io');
const { SUMMARY_METADATA_VERSION } = ioModule;
const listGamesMock = vi.spyOn(ioModule, 'listGames');

function cloneState<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function buildBaseState(): AppState {
  return cloneState(INITIAL_STATE) as AppState;
}

function buildGameRecord(overrides: Partial<GameRecord>): GameRecord {
  const { summary: summaryOverride, bundle: bundleOverride, ...restOverrides } = overrides;
  const baseSummary: GameRecord['summary'] = {
    players: 2,
    scores: { p1: 80, p2: 90 },
    playersById: { p1: 'Alice', p2: 'Bob' },
    winnerId: 'p2',
    winnerName: 'Bob',
    winnerScore: 90,
    mode: 'scorecard',
    metadata: {
      version: SUMMARY_METADATA_VERSION,
      generatedAt: Date.now(),
    },
  };
  const summary: GameRecord['summary'] = {
    ...baseSummary,
    ...(summaryOverride ?? {}),
  };

  const baseBundle: GameRecord['bundle'] = {
    latestSeq: 10,
    events: [],
  };
  const bundle: GameRecord['bundle'] = {
    ...baseBundle,
    ...(bundleOverride ?? {}),
  };

  return {
    id: 'game-1',
    title: 'Game 1',
    createdAt: Date.now() - 1_000,
    finishedAt: Date.now(),
    lastSeq: 10,
    summary,
    bundle,
    ...restOverrides,
  };
}

describe('loadPlayerStatisticsSummary – primary metrics', () => {
  beforeEach(() => {
    resetPlayerStatisticsCache();
    listGamesMock.mockReset();
    listGamesMock.mockResolvedValue([]);
  });

  it('combines live completed game metrics', async () => {
    const state = buildBaseState();
    state.players = { p1: 'Alice', p2: 'Bob' };
    state.scores = { p1: 120, p2: 90 };
    state.sp = { ...state.sp, phase: 'summary', summaryEnteredAt: Date.now() };

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'p1',
      stateSnapshot: state,
    });

    expect(summary.primary).toEqual({
      totalGamesPlayed: 1,
      totalGamesWon: 1,
      winRatePercent: 100,
    });
    expect(summary.loadError).toBeNull();
    expect(summary.secondary).toEqual({
      averageScore: 120,
      highestScore: 120,
      lowestScore: 120,
      averageBidAccuracy: null,
      medianPlacement: 1,
    });
  });

  it('returns null secondary metrics when no completed games exist', async () => {
    const state = buildBaseState();
    state.players = { p1: 'Alice' };
    state.sp = { ...state.sp, phase: 'playing' };

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'p1',
      stateSnapshot: state,
    });

    expect(summary.primary).toEqual({
      totalGamesPlayed: 0,
      totalGamesWon: 0,
      winRatePercent: 0,
    });
    expect(summary.secondary).toBeNull();
  });

  it('includes historical archived games', async () => {
    const state = buildBaseState();
    state.players = { p1: 'Alice', p2: 'Bob' };
    state.scores = { p1: 10, p2: 15 };
    state.sp = { ...state.sp, phase: 'playing' };

    listGamesMock.mockResolvedValue([
      buildGameRecord({
        summary: {
          players: 2,
          scores: { p1: 75, p2: 90 },
          playersById: { p1: 'Alice', p2: 'Bob' },
          winnerId: 'p2',
          winnerName: 'Bob',
          winnerScore: 90,
          mode: 'scorecard',
        },
      }),
    ]);

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'p1',
      stateSnapshot: state,
    });

    expect(summary.primary).toEqual({
      totalGamesPlayed: 1,
      totalGamesWon: 0,
      winRatePercent: 0,
    });
    expect(summary.secondary).toEqual({
      averageScore: 75,
      highestScore: 75,
      lowestScore: 75,
      averageBidAccuracy: null,
      medianPlacement: 2,
    });
  });

  it('calculates secondary averages across live and historical games', async () => {
    const state = buildBaseState();
    state.players = { p1: 'Alice', p2: 'Bob' };
    state.scores = { p1: 150, p2: 120 };
    state.sp = { ...state.sp, phase: 'summary', summaryEnteredAt: Date.now() };

    listGamesMock.mockResolvedValue([
      buildGameRecord({
        id: 'historical-1',
        summary: {
          players: 2,
          scores: { p1: 60, p2: 90 },
          playersById: { p1: 'Alice', p2: 'Bob' },
          winnerId: 'p2',
          winnerName: 'Bob',
          winnerScore: 90,
          mode: 'scorecard',
        },
      }),
      buildGameRecord({
        id: 'historical-2',
        summary: {
          players: 2,
          scores: { p1: 90, p2: 110 },
          playersById: { p1: 'Alice', p2: 'Bob' },
          winnerId: 'p2',
          winnerName: 'Bob',
          winnerScore: 110,
          mode: 'scorecard',
        },
      }),
    ]);

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'p1',
      stateSnapshot: state,
    });

    expect(summary.primary).toEqual({
      totalGamesPlayed: 3,
      totalGamesWon: 1,
      winRatePercent: 33.3,
    });
    expect(summary.secondary).toEqual({
      averageScore: 100,
      highestScore: 150,
      lowestScore: 60,
      averageBidAccuracy: null,
      medianPlacement: 2,
    });
  });

  it('counts single-player archives where players only appear in summary.sp.order', async () => {
    const state = buildBaseState();
    state.players = {};
    state.scores = {};
    state.sp = { ...state.sp, phase: 'playing', order: ['human', 'bot-a'] };

    listGamesMock.mockResolvedValue([
      buildGameRecord({
        summary: {
          players: 2,
          scores: { human: 110, 'bot-a': 75 },
          playersById: {},
          winnerId: 'human',
          winnerName: 'You',
          winnerScore: 110,
          mode: 'single-player',
          sp: {
            phase: 'done',
            roundNo: 10,
            dealerId: 'bot-a',
            leaderId: 'human',
            order: ['human', 'bot-a'],
            trump: 'hearts',
            trumpCard: null,
            trickCounts: { human: 6, 'bot-a': 4 },
            trumpBroken: true,
          },
        },
      }),
    ]);

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'human',
      stateSnapshot: state,
    });

    expect(summary.primary).toEqual({
      totalGamesPlayed: 1,
      totalGamesWon: 1,
      winRatePercent: 100,
    });
    expect(summary.secondary).toEqual({
      averageScore: 110,
      highestScore: 110,
      lowestScore: 110,
      averageBidAccuracy: null,
      medianPlacement: 1,
    });
  });

  it('surfaces load errors from IndexedDB while keeping live stats', async () => {
    const state = buildBaseState();
    state.players = { p1: 'Alice', p2: 'Bob' };
    state.scores = { p1: 40, p2: 60 };
    state.sp = { ...state.sp, phase: 'summary', summaryEnteredAt: Date.now() };

    listGamesMock.mockRejectedValue(new Error('db blocked'));

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'p1',
      stateSnapshot: state,
    });

    expect(summary.primary).toEqual({
      totalGamesPlayed: 1,
      totalGamesWon: 0,
      winRatePercent: 0,
    });
    expect(summary.loadError).toBe('db blocked');
    expect(summary.secondary).toEqual({
      averageScore: 40,
      highestScore: 40,
      lowestScore: 40,
      averageBidAccuracy: null,
      medianPlacement: 2,
    });
  });

  it('counts live single-player completions even without players map entries', async () => {
    const state = buildBaseState();
    state.players = {};
    state.scores = { human: 95, 'bot-a': 60 };
    state.sp = {
      ...state.sp,
      phase: 'summary',
      summaryEnteredAt: Date.now(),
      order: ['human', 'bot-a'],
      trickCounts: { human: 6, 'bot-a': 4 },
    };

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'human',
      stateSnapshot: state,
    });

    expect(summary.primary).toEqual({
      totalGamesPlayed: 1,
      totalGamesWon: 1,
      winRatePercent: 100,
    });
    expect(summary.secondary).toEqual({
      averageScore: 95,
      highestScore: 95,
      lowestScore: 95,
      averageBidAccuracy: null,
      medianPlacement: 1,
    });
  });

  it('matches historical games by player name when ids differ', async () => {
    const state = buildBaseState();
    state.players = { 'player-2': 'You' };

    listGamesMock.mockResolvedValue([
      buildGameRecord({
        summary: {
          players: 1,
          scores: { legacy: 120 },
          playersById: { legacy: 'You' },
          winnerId: 'legacy',
          winnerName: 'You',
          winnerScore: 120,
          mode: 'single-player',
        },
      }),
    ]);

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'player-2',
      stateSnapshot: state,
    });

    expect(summary.primary).toEqual({
      totalGamesPlayed: 1,
      totalGamesWon: 1,
      winRatePercent: 100,
    });
    expect(summary.secondary).toEqual({
      averageScore: 120,
      highestScore: 120,
      lowestScore: 120,
      averageBidAccuracy: null,
      medianPlacement: 1,
    });
  });

  it('matches legacy slot aliases when player keeps generic label', async () => {
    const state = buildBaseState();
    state.players = { 'legacy-p1': 'Player 1' };
    state.playerDetails = {
      'legacy-p1': {
        name: 'Player 1',
        type: 'human',
        archived: false,
        archivedAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
    };
    state.display_order = { 'legacy-p1': 0 };

    listGamesMock.mockResolvedValue([
      buildGameRecord({
        id: 'legacy-generic',
        summary: {
          players: 2,
          scores: { p1: 88, p2: 64 },
          playersById: { p1: 'Player 1', p2: 'Player 2' },
          winnerId: 'p1',
          winnerName: 'Player 1',
          winnerScore: 88,
          mode: 'scorecard',
        },
      }),
    ]);

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'legacy-p1',
      stateSnapshot: state,
    });

    expect(summary.primary).toEqual({
      totalGamesPlayed: 1,
      totalGamesWon: 1,
      winRatePercent: 100,
    });
    expect(summary.secondary).toEqual({
      averageScore: 88,
      highestScore: 88,
      lowestScore: 88,
      averageBidAccuracy: null,
      medianPlacement: 1,
    });
  });

  it('skips generic slot aliases when player has a unique name', async () => {
    const state = buildBaseState();
    state.players = { 'player-target': 'Alice' };
    state.playerDetails = {
      'player-target': {
        name: 'Alice',
        type: 'human',
        archived: false,
        archivedAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
    };
    state.display_order = { 'player-target': 0 };

    listGamesMock.mockResolvedValue([
      buildGameRecord({
        id: 'generic-history',
        summary: {
          players: 2,
          scores: { p1: 150, p2: 40 },
          playersById: { p1: 'Player 1', p2: 'Player 2' },
          winnerId: 'p1',
          winnerName: 'Player 1',
          winnerScore: 150,
          mode: 'scorecard',
        },
      }),
    ]);

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'player-target',
      stateSnapshot: state,
    });

    expect(summary.primary).toEqual({
      totalGamesPlayed: 0,
      totalGamesWon: 0,
      winRatePercent: 0,
    });
    expect(summary.secondary).toBeNull();
  });
});
