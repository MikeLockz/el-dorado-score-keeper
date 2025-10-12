import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INITIAL_STATE, loadPlayerStatisticsSummary, resetPlayerStatisticsCache } from '@/lib/state';
import type { AppState } from '@/lib/state';
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
  const { summary: summaryOverride, bundle: bundleOverride, ...rest } = overrides;
  const baseSummary: GameRecord['summary'] = {
    players: 2,
    scores: { p1: 100, p2: 90 },
    playersById: { p1: 'Alice', p2: 'Bob' },
    winnerId: 'p1',
    winnerName: 'Alice',
    winnerScore: 100,
    mode: 'single-player',
    sp: {
      phase: 'done',
      roundTallies: {},
    },
    metadata: {
      version: SUMMARY_METADATA_VERSION,
      generatedAt: Date.now(),
    },
  };
  const baseBundle: GameRecord['bundle'] = {
    latestSeq: 10,
    events: [],
  };
  const summary: GameRecord['summary'] = {
    ...baseSummary,
    ...(summaryOverride ?? {}),
  };
  const bundle: GameRecord['bundle'] = {
    ...baseBundle,
    ...(bundleOverride ?? {}),
  };

  return {
    id: 'secondary-game',
    title: 'Secondary Game',
    createdAt: Date.now() - 5_000,
    finishedAt: Date.now() - 1_000,
    lastSeq: 10,
    summary,
    bundle,
    ...rest,
  };
}

describe('loadPlayerStatisticsSummary – secondary metrics', () => {
  beforeEach(() => {
    resetPlayerStatisticsCache();
    listGamesMock.mockReset();
    listGamesMock.mockResolvedValue([]);
  });

  it('derives average bid accuracy from archived events', async () => {
    const state = buildBaseState();
    state.players = { p1: 'Alice', p2: 'Bob' };
    state.scores = {};

    listGamesMock.mockResolvedValue([
      buildGameRecord({
        summary: {
          scores: { p1: 120, p2: 90 },
          sp: {
            phase: 'done',
            roundTallies: {
              1: { p1: 3, p2: 1 },
              2: { p1: 2, p2: 3 },
            },
          },
        },
        bundle: {
          latestSeq: 6,
          events: [
            { eventId: 'e1', ts: 1, type: 'bid/set', payload: { round: 1, playerId: 'p1', bid: 3 } },
            { eventId: 'e2', ts: 2, type: 'bid/set', payload: { round: 2, playerId: 'p1', bid: 2 } },
            {
              eventId: 'e3',
              ts: 3,
              type: 'sp/round-tally-set',
              payload: { round: 1, tallies: { p1: 3, p2: 1 } },
            },
            {
              eventId: 'e4',
              ts: 4,
              type: 'sp/round-tally-set',
              payload: { round: 2, tallies: { p1: 2, p2: 3 } },
            },
          ],
        },
      }),
    ]);

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'p1',
      stateSnapshot: state,
    });

    expect(summary.secondary).not.toBeNull();
    expect(summary.secondary?.averageBidAccuracy).toBe(100);
    expect(summary.secondary?.medianPlacement).toBe(1);
  });

  it('combines live and historical bid accuracy metrics', async () => {
    const state = buildBaseState();
    state.players = { p1: 'Alice', p2: 'Bob' };
    state.scores = { p1: 90, p2: 80 };
    state.sp = {
      ...state.sp,
      phase: 'summary',
      summaryEnteredAt: Date.now(),
      roundTallies: {
        1: { p1: 2, p2: 1 },
        2: { p1: 0, p2: 3 },
      },
    };
    const roundOne = state.rounds[1] ?? ({ state: 'locked', bids: {}, made: {} } as AppState['rounds'][number]);
    const roundTwo = state.rounds[2] ?? ({ state: 'locked', bids: {}, made: {} } as AppState['rounds'][number]);
    state.rounds = {
      ...state.rounds,
      1: { ...roundOne, bids: { ...(roundOne.bids ?? {}), p1: 2 } },
      2: { ...roundTwo, bids: { ...(roundTwo.bids ?? {}), p1: 1 } },
    };

    listGamesMock.mockResolvedValue([
      buildGameRecord({
        summary: {
          scores: { p1: 50, p2: 60 },
          winnerId: 'p2',
          winnerName: 'Bob',
          winnerScore: 60,
          sp: {
            phase: 'done',
            roundTallies: {
              1: { p1: 1, p2: 2 },
            },
          },
        },
        bundle: {
          latestSeq: 4,
          events: [
            { eventId: 'h1', ts: 1, type: 'bid/set', payload: { round: 1, playerId: 'p1', bid: 1 } },
            {
              eventId: 'h2',
              ts: 2,
              type: 'sp/round-tally-set',
              payload: { round: 1, tallies: { p1: 1, p2: 2 } },
            },
          ],
        },
      }),
    ]);

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'p1',
      stateSnapshot: state,
    });

    expect(summary.secondary).not.toBeNull();
    expect(summary.secondary?.averageBidAccuracy).toBeCloseTo(66.7, 1);
    expect(summary.secondary?.medianPlacement).toBe(1);
  });

  it('returns null accuracy when no bids were recorded', async () => {
    const state = buildBaseState();
    state.players = { p1: 'Alice', p2: 'Bob' };
    state.sp = { ...state.sp, phase: 'summary', summaryEnteredAt: Date.now() };
    state.scores = { p1: 110, p2: 95 };

    listGamesMock.mockResolvedValue([
      buildGameRecord({
        summary: {
          scores: { p1: 85, p2: 70 },
        },
        bundle: {
          events: [],
        },
      }),
    ]);

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'p1',
      stateSnapshot: state,
    });

    expect(summary.secondary).not.toBeNull();
    expect(summary.secondary?.averageBidAccuracy).toBeNull();
    expect(summary.secondary?.medianPlacement).toBe(1);
  });
});
