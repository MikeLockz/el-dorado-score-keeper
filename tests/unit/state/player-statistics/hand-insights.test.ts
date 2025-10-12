import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INITIAL_STATE,
  loadPlayerStatisticsSummary,
  resetPlayerStatisticsCache,
  type AppState,
} from '@/lib/state';
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
  const state = cloneState(INITIAL_STATE) as AppState;
  state.players = { p1: 'Alice', p2: 'Bob' };
  state.playerDetails = {
    p1: {
      name: 'Alice',
      type: 'human',
      archived: false,
      archivedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    p2: {
      name: 'Bob',
      type: 'human',
      archived: false,
      archivedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
  return state;
}

function buildGameRecord(overrides: Partial<GameRecord>): GameRecord {
  const summaryOverride = overrides.summary ?? {};
  const bundleOverride = overrides.bundle ?? {};

  const summary: GameRecord['summary'] = {
    players: 2,
    scores: { p1: 120, p2: 80 },
    playersById: { p1: 'Alice', p2: 'Bob' },
    winnerId: 'p1',
    winnerName: 'Alice',
    winnerScore: 120,
    mode: 'single-player',
    sp: {
      phase: 'done',
      roundTallies: {},
    },
    metadata: {
      version: SUMMARY_METADATA_VERSION,
      generatedAt: Date.now(),
    },
    ...summaryOverride,
  };

  const bundle: GameRecord['bundle'] = {
    latestSeq: 15,
    events: [],
    ...bundleOverride,
  };

  return {
    id: 'hand-test',
    title: 'Hand Insight Test',
    createdAt: Date.now() - 10_000,
    finishedAt: Date.now() - 9_000,
    lastSeq: 15,
    summary,
    bundle,
    ...overrides,
  };
}

describe('loadPlayerStatisticsSummary – hand insights', () => {
  beforeEach(() => {
    resetPlayerStatisticsCache();
    listGamesMock.mockReset();
    listGamesMock.mockResolvedValue([]);
  });

  it('derives suit counts and top suit from archived trick plays', async () => {
    const state = buildBaseState();

    listGamesMock.mockResolvedValue([
      buildGameRecord({
        id: 'hand-1',
        bundle: {
          latestSeq: 6,
          events: [
            {
              eventId: 'e1',
              ts: 1,
              type: 'sp/trick/played',
              payload: { playerId: 'p1', card: { suit: 'hearts', rank: 12 } },
            },
            {
              eventId: 'e2',
              ts: 2,
              type: 'sp/trick/played',
              payload: { playerId: 'p1', card: { suit: 'hearts', rank: 9 } },
            },
            {
              eventId: 'e3',
              ts: 3,
              type: 'sp/trick/played',
              payload: { playerId: 'p1', card: { suit: 'clubs', rank: 7 } },
            },
            {
              eventId: 'e4',
              ts: 4,
              type: 'sp/trick/played',
              payload: { playerId: 'p2', card: { suit: 'spades', rank: 11 } },
            },
          ],
        },
      }),
    ]);

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'p1',
      stateSnapshot: state,
    });

    expect(summary.handInsights).not.toBeNull();
    expect(summary.handInsights?.handsPlayed).toBe(3);
    expect(summary.handInsights?.topSuit).toBe('hearts');
    expect(summary.handInsights?.suitCounts.hearts).toBe(2);
    expect(summary.handInsights?.suitCounts.clubs).toBe(1);
    expect(summary.handInsights?.suitCounts.spades).toBe(0);
  });

  it('returns null top suit when multiple suits tie', async () => {
    const state = buildBaseState();

    listGamesMock.mockResolvedValue([
      buildGameRecord({
        id: 'hand-2',
        bundle: {
          latestSeq: 6,
          events: [
            {
              eventId: 'e1',
              ts: 1,
              type: 'sp/trick/played',
              payload: { playerId: 'p1', card: { suit: 'hearts', rank: 12 } },
            },
            {
              eventId: 'e2',
              ts: 2,
              type: 'sp/trick/played',
              payload: { playerId: 'p1', card: { suit: 'diamonds', rank: 10 } },
            },
            {
              eventId: 'e3',
              ts: 3,
              type: 'sp/trick/played',
              payload: { playerId: 'p1', card: { suit: 'hearts', rank: 3 } },
            },
            {
              eventId: 'e4',
              ts: 4,
              type: 'sp/trick/played',
              payload: { playerId: 'p1', card: { suit: 'diamonds', rank: 8 } },
            },
          ],
        },
      }),
    ]);

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'p1',
      stateSnapshot: state,
    });

    expect(summary.handInsights).not.toBeNull();
    expect(summary.handInsights?.handsPlayed).toBe(4);
    expect(summary.handInsights?.topSuit).toBeNull();
    expect(summary.handInsights?.suitCounts.hearts).toBe(2);
    expect(summary.handInsights?.suitCounts.diamonds).toBe(2);
  });
});
