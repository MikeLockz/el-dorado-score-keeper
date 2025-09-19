import { describe, it, expect, vi } from 'vitest';

import {
  buildSinglePlayerDerivedState,
  buildConfirmBidBatch,
} from '@/components/views/sp/useSinglePlayerViewModel';
import { INITIAL_STATE } from '@/lib/state';
import type { AppState, RoundData } from '@/lib/state/types';

const makeRounds = (): Record<number, RoundData> => {
  const rounds: Record<number, RoundData> = {};
  for (let r = 0; r <= 10; r++) {
    rounds[r] = { state: 'locked', bids: {}, made: {} } as RoundData;
  }
  rounds[0] = { state: 'bidding', bids: { human: 2 }, made: { human: null } } as RoundData;
  rounds[1] = {
    state: 'scored',
    bids: { human: 1, bot1: 0 },
    made: { human: true, bot1: false },
  } as RoundData;
  return rounds;
};

const rosterId = 'roster-1';

const makeBaseState = (): AppState => {
  const base: AppState = {
    ...INITIAL_STATE,
    players: { human: 'Alice H', bot1: 'Bot Bob' },
    playerDetails: {},
    scores: { human: 10, bot1: 5 },
    rounds: makeRounds(),
    rosters: {
      [rosterId]: {
        name: 'Test Roster',
        playersById: { human: 'Alice H', bot1: 'Bot Bob' },
        playerTypesById: { human: 'human', bot1: 'bot' },
        displayOrder: { human: 0, bot1: 1 },
        type: 'single',
        createdAt: 0,
        archivedAt: null,
      },
    },
    activeScorecardRosterId: null,
    activeSingleRosterId: rosterId,
    humanByMode: { single: 'human' },
    sp: {
      ...INITIAL_STATE.sp,
      phase: 'playing',
      roundNo: 0,
      dealerId: 'bot1',
      order: ['bot1', 'human'],
      trump: 'spades',
      trumpCard: { suit: 'spades', rank: 12 },
      hands: {
        human: [
          { suit: 'spades', rank: 14 },
          { suit: 'hearts', rank: 13 },
        ],
        bot1: [{ suit: 'spades', rank: 13 }],
      },
      trickPlays: [{ playerId: 'bot1', card: { suit: 'spades', rank: 13 } }],
      trickCounts: { human: 1, bot1: 0 },
      trumpBroken: true,
      leaderId: 'bot1',
      reveal: null,
      lastTrickSnapshot: {
        ledBy: 'bot1',
        plays: [
          { playerId: 'bot1', card: { suit: 'diamonds', rank: 11 } },
          { playerId: 'human', card: { suit: 'diamonds', rank: 9 } },
        ],
        winnerId: 'human',
      },
      summaryEnteredAt: 123,
      sessionSeed: 456,
    },
    display_order: { human: 0, bot1: 1 },
  };
  return base;
};

describe('buildSinglePlayerDerivedState', () => {
  it('computes shared single-player data', () => {
    const state = makeBaseState();
    const derived = buildSinglePlayerDerivedState(state, 'human');

    expect(derived.spPhase).toBe('playing');
    expect(derived.spRoundNo).toBe(0);
    expect(derived.players.map((p) => p.id)).toEqual(['human', 'bot1']);
    expect(derived.playerNamesById.human).toBe('Alice H');
    expect(derived.humanBid).toBe(2);
    expect(derived.isTrumpBroken).toBe(true);
    expect(derived.handNow).toBe(2);
    expect(derived.totalTricksSoFar).toBe(1);
    expect(derived.trickPlays).toHaveLength(1);
    expect(derived.humanBySuit.spades[0]?.rank).toBe(14);
    expect(derived.summaryEnteredAt).toBe(123);
    expect(derived.lastTrickSnapshot?.winnerId).toBe('human');
    expect(derived.suitOrder).toEqual(['spades', 'hearts', 'diamonds', 'clubs']);
  });
});

describe('buildConfirmBidBatch', () => {
  it('builds human and bot bid events when bots have not bid', () => {
    const base = makeBaseState();
    const biddingState: AppState = {
      ...base,
      rounds: {
        ...base.rounds,
        0: { state: 'bidding', bids: {}, made: {} } as RoundData,
      },
      sp: {
        ...base.sp,
        phase: 'bidding',
        trickPlays: [],
        trickCounts: { human: 0, bot1: 0 },
        trumpBroken: false,
      },
    };

    const derived = buildSinglePlayerDerivedState(biddingState, 'human');
    const botBid = vi.fn().mockReturnValue(1);
    const batch = buildConfirmBidBatch(
      biddingState,
      { humanId: 'human', bid: 3, derived, rng: () => 0.5 },
      { botBid },
    );

    expect(botBid).toHaveBeenCalledOnce();
    expect(batch.map((evt) => evt.type)).toEqual([
      'bid/set',
      'bid/set',
      'round/state-set',
      'sp/phase-set',
    ]);
    expect(batch[0]?.payload).toMatchObject({ playerId: 'human', bid: 3 });
    expect(batch[1]?.payload).toMatchObject({ playerId: 'bot1', bid: 1 });
  });

  it('returns empty batch when phase is not bidding', () => {
    const state = makeBaseState();
    const derived = buildSinglePlayerDerivedState(state, 'human');
    const batch = buildConfirmBidBatch(state, { humanId: 'human', bid: 2, derived, rng: () => 0 });
    expect(batch).toHaveLength(0);
  });
});
