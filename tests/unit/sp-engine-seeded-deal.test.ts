import { describe, it, expect } from 'vitest';
import { buildNextRoundDealBatch } from '@/lib/single-player/engine';
import type { AppState } from '@/lib/state/types';
import { createUnitTestTemplate } from '../utils/test-patterns';

function baseState(sessionSeed: number): AppState {
  return {
    players: { a: 'A', b: 'B', c: 'C', d: 'D' },
    scores: {},
    rounds: {
      1: {
        state: 'scored',
        bids: { a: 1, b: 1, c: 1, d: 1 },
        made: { a: true, b: true, c: true, d: true },
      },
      2: { state: 'bidding', bids: {}, made: {} as any },
    },
    sp: {
      phase: 'summary',
      roundNo: 1,
      dealerId: 'a',
      order: ['a', 'b', 'c', 'd'],
      trump: null,
      trumpCard: null,
      hands: { a: [], b: [], c: [], d: [] },
      trickPlays: [],
      trickCounts: { a: 0, b: 0, c: 0, d: 0 },
      trumpBroken: false,
      leaderId: 'a',
      reveal: null,
      handPhase: 'idle',
      lastTrickSnapshot: null,
      sessionSeed,
    },
    display_order: { a: 0, b: 1, c: 2, d: 3 },
  };
}

createUnitTestTemplate('buildNextRoundDealBatch seeding', {}, () => {
  it('produces identical deals for same sessionSeed', () => {
    const s = baseState(424242);
    const now = 111111;
    const b1 = buildNextRoundDealBatch(s, now);
    const b2 = buildNextRoundDealBatch(s, now);
    const d1 = b1.find((e) => e.type === 'sp/deal')!;
    const d2 = b2.find((e) => e.type === 'sp/deal')!;
    expect(d1).toBeTruthy();
    expect(JSON.stringify(d1.payload)).toEqual(JSON.stringify(d2.payload));
  });

  it('differs when sessionSeed differs', () => {
    const now = 222222;
    const sA = baseState(1);
    const sB = baseState(2);
    const dA = buildNextRoundDealBatch(sA, now).find((e) => e.type === 'sp/deal')!;
    const dB = buildNextRoundDealBatch(sB, now).find((e) => e.type === 'sp/deal')!;
    expect(JSON.stringify(dA.payload)).not.toEqual(JSON.stringify(dB.payload));
  });
});
