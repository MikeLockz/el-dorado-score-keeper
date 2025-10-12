import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INITIAL_STATE,
  loadPlayerStatisticsSummary,
  resetPlayerStatisticsCache,
} from '@/lib/state';
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
  const state = cloneState(INITIAL_STATE) as AppState;
  state.players = { p1: 'Alice', p2: 'Bob' };
  state.playerDetails = {
    p1: { name: 'Alice', type: 'human' },
    p2: { name: 'Bob', type: 'human' },
  } as AppState['playerDetails'];
  return state;
}

function buildGameRecordHeartsWin(): GameRecord {
  const now = Date.now();
  return {
    id: 'g-hearts',
    title: 'Hearts Victory',
    createdAt: now - 10_000,
    finishedAt: now - 9_000,
    lastSeq: 30,
    summary: {
      players: 2,
      playersById: { p1: 'Alice', p2: 'Bob' },
      playerTypesById: { p1: 'human', p2: 'human' },
      winnerId: 'p1',
      winnerName: 'Alice',
      winnerScore: 120,
      scores: { p1: 120, p2: 110 },
      mode: 'single-player',
      sp: {
        phase: 'done',
        order: ['p1', 'p2'],
        dealerId: 'p1',
        roundTallies: {
          1: { p1: 2, p2: 0 },
          2: { p1: 2, p2: 3 },
        },
      },
      metadata: {
        version: SUMMARY_METADATA_VERSION,
        generatedAt: now - 8_900,
      },
    },
    bundle: {
      latestSeq: 30,
      events: [
        {
          eventId: 'g1-s-deficit',
          ts: now - 9_950,
          type: 'score/added',
          payload: { playerId: 'p2', delta: 30 },
        },
        {
          eventId: 'g1-s-surge',
          ts: now - 9_940,
          type: 'score/added',
          payload: { playerId: 'p1', delta: 40 },
        },
        {
          eventId: 'g1-deal',
          ts: now - 9_930,
          type: 'sp/deal',
          payload: {
            roundNo: 1,
            dealerId: 'p1',
            order: ['p1', 'p2'],
            trump: 'hearts',
            trumpCard: { suit: 'hearts', rank: 12 },
            hands: { p1: [], p2: [] },
          },
        },
        // Trick 1 hearts, p1 wins
        {
          eventId: 'g1-t1a',
          ts: now - 9_920,
          type: 'sp/trick/played',
          payload: { playerId: 'p1', card: { suit: 'hearts', rank: 11 } },
        },
        {
          eventId: 'g1-t1b',
          ts: now - 9_915,
          type: 'sp/trick/played',
          payload: { playerId: 'p2', card: { suit: 'hearts', rank: 10 } },
        },
        {
          eventId: 'g1-t1c',
          ts: now - 9_910,
          type: 'sp/trick/cleared',
          payload: { winnerId: 'p1' },
        },
        // Trick 2 hearts, p2 wins
        {
          eventId: 'g1-t2a',
          ts: now - 9_905,
          type: 'sp/trick/played',
          payload: { playerId: 'p1', card: { suit: 'hearts', rank: 9 } },
        },
        {
          eventId: 'g1-t2b',
          ts: now - 9_900,
          type: 'sp/trick/played',
          payload: { playerId: 'p2', card: { suit: 'hearts', rank: 14 } },
        },
        {
          eventId: 'g1-t2c',
          ts: now - 9_895,
          type: 'sp/trick/cleared',
          payload: { winnerId: 'p2' },
        },
        // Trick 3 hearts, p1 wins
        {
          eventId: 'g1-t3a',
          ts: now - 9_890,
          type: 'sp/trick/played',
          payload: { playerId: 'p1', card: { suit: 'hearts', rank: 8 } },
        },
        {
          eventId: 'g1-t3b',
          ts: now - 9_885,
          type: 'sp/trick/played',
          payload: { playerId: 'p2', card: { suit: 'hearts', rank: 7 } },
        },
        {
          eventId: 'g1-t3c',
          ts: now - 9_880,
          type: 'sp/trick/cleared',
          payload: { winnerId: 'p1' },
        },
        // Round data
        {
          eventId: 'g1-bid-r1',
          ts: now - 9_870,
          type: 'bid/set',
          payload: { round: 1, playerId: 'p1', bid: 2 },
        },
        {
          eventId: 'g1-tally-r1',
          ts: now - 9_865,
          type: 'sp/round-tally-set',
          payload: { round: 1, tallies: { p1: 2, p2: 0 } },
        },
        {
          eventId: 'g1-bid-r2',
          ts: now - 9_860,
          type: 'bid/set',
          payload: { round: 2, playerId: 'p1', bid: 3 },
        },
        {
          eventId: 'g1-tally-r2',
          ts: now - 9_855,
          type: 'sp/round-tally-set',
          payload: { round: 2, tallies: { p1: 2, p2: 3 } },
        },
      ],
    },
  };
}

function buildGameRecordClubsLoss(): GameRecord {
  const now = Date.now();
  return {
    id: 'g-clubs',
    title: 'Clubs Defeat',
    createdAt: now - 8_000,
    finishedAt: now - 7_000,
    lastSeq: 24,
    summary: {
      players: 2,
      playersById: { p1: 'Alice', p2: 'Bob' },
      playerTypesById: { p1: 'human', p2: 'human' },
      winnerId: 'p2',
      winnerName: 'Bob',
      winnerScore: 120,
      scores: { p1: 90, p2: 120 },
      mode: 'single-player',
      sp: {
        phase: 'done',
        order: ['p1', 'p2'],
        dealerId: 'p2',
        roundTallies: {
          1: { p1: 0, p2: 3 },
        },
      },
      metadata: {
        version: SUMMARY_METADATA_VERSION,
        generatedAt: now - 6_900,
      },
    },
    bundle: {
      latestSeq: 24,
      events: [
        {
          eventId: 'g2-lead',
          ts: now - 7_950,
          type: 'score/added',
          payload: { playerId: 'p1', delta: 50 },
        },
        {
          eventId: 'g2-response',
          ts: now - 7_940,
          type: 'score/added',
          payload: { playerId: 'p2', delta: 80 },
        },
        {
          eventId: 'g2-finish',
          ts: now - 7_930,
          type: 'score/added',
          payload: { playerId: 'p2', delta: 10 },
        },
        {
          eventId: 'g2-deal',
          ts: now - 7_920,
          type: 'sp/deal',
          payload: {
            roundNo: 1,
            dealerId: 'p2',
            order: ['p2', 'p1'],
            trump: 'clubs',
            trumpCard: { suit: 'clubs', rank: 13 },
            hands: { p1: [], p2: [] },
          },
        },
        // Trick 1 clubs, p1 wins
        {
          eventId: 'g2-t1a',
          ts: now - 7_910,
          type: 'sp/trick/played',
          payload: { playerId: 'p1', card: { suit: 'clubs', rank: 12 } },
        },
        {
          eventId: 'g2-t1b',
          ts: now - 7_905,
          type: 'sp/trick/played',
          payload: { playerId: 'p2', card: { suit: 'clubs', rank: 11 } },
        },
        {
          eventId: 'g2-t1c',
          ts: now - 7_900,
          type: 'sp/trick/cleared',
          payload: { winnerId: 'p1' },
        },
        // Trick 2 clubs, p2 wins
        {
          eventId: 'g2-t2a',
          ts: now - 7_895,
          type: 'sp/trick/played',
          payload: { playerId: 'p2', card: { suit: 'clubs', rank: 14 } },
        },
        {
          eventId: 'g2-t2b',
          ts: now - 7_890,
          type: 'sp/trick/played',
          payload: { playerId: 'p1', card: { suit: 'clubs', rank: 9 } },
        },
        {
          eventId: 'g2-t2c',
          ts: now - 7_885,
          type: 'sp/trick/cleared',
          payload: { winnerId: 'p2' },
        },
        // Trick 3 clubs, p2 wins
        {
          eventId: 'g2-t3a',
          ts: now - 7_880,
          type: 'sp/trick/played',
          payload: { playerId: 'p2', card: { suit: 'clubs', rank: 10 } },
        },
        {
          eventId: 'g2-t3b',
          ts: now - 7_875,
          type: 'sp/trick/played',
          payload: { playerId: 'p1', card: { suit: 'clubs', rank: 8 } },
        },
        {
          eventId: 'g2-t3c',
          ts: now - 7_870,
          type: 'sp/trick/cleared',
          payload: { winnerId: 'p2' },
        },
        {
          eventId: 'g2-bid-r1',
          ts: now - 7_860,
          type: 'bid/set',
          payload: { round: 1, playerId: 'p1', bid: 1 },
        },
        {
          eventId: 'g2-tally-r1',
          ts: now - 7_855,
          type: 'sp/round-tally-set',
          payload: { round: 1, tallies: { p1: 0, p2: 3 } },
        },
      ],
    },
  };
}

describe('loadPlayerStatisticsSummary – advanced metrics', () => {
  beforeEach(() => {
    resetPlayerStatisticsCache();
    listGamesMock.mockReset();
  });

  it('derives trick efficiency, suit mastery, volatility, and momentum aggregates', async () => {
    const state = buildBaseState();
    listGamesMock.mockResolvedValue([buildGameRecordHeartsWin(), buildGameRecordClubsLoss()]);

    const summary = await loadPlayerStatisticsSummary({
      playerId: 'p1',
      stateSnapshot: state,
    });

    expect(summary.advanced).not.toBeNull();
    const advanced = summary.advanced!;

    expect(advanced.trickEfficiency.averageDelta).toBeCloseTo(-0.7, 1);
    expect(advanced.trickEfficiency.perfectBidStreak).toBe(1);

    expect(advanced.suitMastery.trumpWinRateBySuit.hearts).toBeCloseTo(100, 1);
    expect(advanced.suitMastery.trumpWinRateBySuit.clubs).toBeCloseTo(0, 1);
    expect(advanced.suitMastery.trumpWinRateBySuit.spades).toBeNull();

    expect(advanced.suitMastery.trickSuccessBySuit.hearts).toBeCloseTo(66.7, 1);
    expect(advanced.suitMastery.trickSuccessBySuit.clubs).toBeCloseTo(33.3, 1);

    expect(advanced.scoreVolatility.standardDeviation).toBeCloseTo(15, 1);
    expect(advanced.scoreVolatility.largestComeback).toBe(30);
    expect(advanced.scoreVolatility.largestLeadBlown).toBe(50);

    expect(advanced.momentum.rollingAverageScores).toHaveLength(2);
    expect(advanced.momentum.rollingAverageScores[1]?.average).toBeCloseTo(105, 1);
    expect(advanced.momentum.currentWinStreak).toBe(0);
    expect(advanced.momentum.longestWinStreak).toBe(1);
  });
});
