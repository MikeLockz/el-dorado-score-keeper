import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INITIAL_STATE,
  loadPlayerStatisticsSummary,
  resetPlayerStatisticsCache,
} from '@/lib/state';
import type { AppState } from '@/lib/state';

const ioModule = await import('@/lib/state/io');
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

describe('loadPlayerStatisticsSummary – round metrics', () => {
  beforeEach(() => {
    resetPlayerStatisticsCache();
    listGamesMock.mockReset();
    listGamesMock.mockResolvedValue([]);
  });

  it('returns empty round metrics when no games exist', async () => {
    const state = buildBaseState();
    state.players = { p1: 'Alice' };

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'p1',
      stateSnapshot: state,
    });

    expect(summary.rounds).toHaveLength(10);
    for (const metric of summary.rounds) {
      expect(metric.roundNo).toBeGreaterThan(0);
      expect(metric.bidCount).toBe(0);
      expect(metric.bids).toEqual([]);
      expect(metric.accuracyMatches).toBe(0);
      expect(metric.accuracyTotal).toBe(0);
      expect(metric.accuracyPercent).toBeNull();
    }
  });

  it('derives round accuracy from the active state when the live game is complete', async () => {
    const state = buildBaseState();
    state.players = { p1: 'Alice', p2: 'Bob' };
    state.scores = { p1: 105, p2: 92 };
    state.sp = {
      ...state.sp,
      phase: 'summary',
      summaryEnteredAt: Date.now(),
      roundTallies: {
        1: { p1: 3, p2: 0 },
        2: { p1: 1, p2: 2 },
      },
    };
    state.rounds = {
      ...state.rounds,
      1: {
        ...state.rounds[1],
        bids: { ...(state.rounds[1]?.bids ?? {}), p1: 3 },
      },
      2: {
        ...state.rounds[2],
        bids: { ...(state.rounds[2]?.bids ?? {}), p1: 2 },
      },
    };

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'p1',
      stateSnapshot: state,
    });

    const roundOne = summary.rounds.find((round) => round.roundNo === 1);
    const roundTwo = summary.rounds.find((round) => round.roundNo === 2);

    expect(roundOne).toBeTruthy();
    expect(roundOne?.accuracyMatches).toBe(1);
    expect(roundOne?.accuracyTotal).toBe(1);
    expect(roundOne?.accuracyPercent).toBe(100);
    expect(roundOne?.bids).toEqual([3]);

    expect(roundTwo).toBeTruthy();
    expect(roundTwo?.accuracyMatches).toBe(0);
    expect(roundTwo?.accuracyTotal).toBe(1);
    expect(roundTwo?.accuracyPercent).toBe(0);
    expect(roundTwo?.bids).toEqual([2]);
  });
});
