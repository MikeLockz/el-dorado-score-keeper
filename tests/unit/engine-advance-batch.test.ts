import { describe, it, expect, vi } from 'vitest';
import { computeAdvanceBatch } from '@/lib/single-player/engine';
import { events, makeEvent } from '@/lib/state/events';
import type { AppEvent, AppState } from '@/lib/state/types';

const base: AppState = {
  players: { a: 'A', b: 'B' },
  scores: {},
  rounds: {
    1: { state: 'playing', bids: { a: 1, b: 0 }, made: { a: null as any, b: null as any } },
  },
  sp: {
    phase: 'playing',
    roundNo: 1,
    dealerId: 'b',
    order: ['a', 'b'],
    trump: 'hearts',
    trumpCard: { suit: 'hearts', rank: 12 },
    hands: { a: [], b: [] },
    trickPlays: [],
    trickCounts: { a: 0, b: 0 },
    trumpBroken: false,
    leaderId: 'a',
    reveal: null,
    finalizeHold: false,
    handPhase: 'idle',
    ack: 'none',
    lastTrickSnapshot: null,
  },
  display_order: { a: 0, b: 1 },
};

vi.mock('@/lib/single-player', async () => {
  return {
    bots: { botBid: () => 0, botPlay: () => ({ suit: 'clubs', rank: 2 }) },
    startRound: vi.fn((cfg: any) => ({
      order: cfg.players,
      trump: 'spades',
      trumpCard: { suit: 'spades', rank: 14 },
      hands: { a: [], b: [] },
      firstToAct: cfg.players[0],
    })),
    winnerOfTrick: vi.fn((plays: any[]) => plays[1]?.player ?? 'a'),
  };
});

describe('computeAdvanceBatch', () => {
  it('returns reveal batch with ack when trick completes', () => {
    const s: AppState = {
      ...base,
      sp: {
        ...base.sp,
        trickPlays: [
          { playerId: 'a', card: { suit: 'clubs', rank: 2 } },
          { playerId: 'b', card: { suit: 'clubs', rank: 3 } },
        ],
      },
    };
    const out = computeAdvanceBatch(s, Date.now());
    const types = out.map((e) => e.type);
    expect(types).toContain('sp/trick/reveal-set');
    expect(types).toContain('sp/ack-set');
  });

  it('returns clear + leader + reveal-clear during reveal', () => {
    const s: AppState = {
      ...base,
      sp: {
        ...base.sp,
        trickPlays: [
          { playerId: 'a', card: { suit: 'clubs', rank: 2 } },
          { playerId: 'b', card: { suit: 'clubs', rank: 3 } },
        ],
        reveal: { winnerId: 'a' },
      },
    };
    const out = computeAdvanceBatch(s, Date.now());
    expect(out.map((e) => e.type)).toEqual([
      'sp/trick/cleared',
      'sp/leader-set',
      'sp/trick/reveal-clear',
      'sp/ack-set',
    ]);
  });

  it('finalizes to summary when round done with no reveal', () => {
    const s: AppState = {
      ...base,
      rounds: { 10: { state: 'playing', bids: { a: 1, b: 0 }, made: {} as any } },
      sp: { ...base.sp, roundNo: 10, trickCounts: { a: 1, b: 0 } },
    };
    const out = computeAdvanceBatch(s, 1234567890);
    const types = out.map((e) => e.type);
    expect(types).toContain('made/set');
    expect(types).toContain('round/finalize');
    expect(types).toContain('sp/phase-set');
    expect(types).toContain('sp/summary-entered-set');
  });

  it('continues summary to next round on user intent', () => {
    const s: AppState = {
      ...base,
      rounds: { 1: { state: 'scored', bids: { a: 1, b: 0 }, made: { a: true, b: false } } },
      sp: { ...base.sp, phase: 'summary', summaryEnteredAt: 1000 },
    };
    const out = computeAdvanceBatch(s, 2000, { intent: 'user' });
    const types = out.map((e) => e.type);
    expect(types).toContain('sp/deal');
    expect(types).toContain('sp/leader-set');
    expect(types).toContain('sp/phase-set');
    expect(types).toContain('round/state-set');
  });

  it('auto-advances summary after threshold when intent=auto', () => {
    const s: AppState = {
      ...base,
      rounds: { 1: { state: 'scored', bids: { a: 1, b: 0 }, made: { a: true, b: false } } },
      sp: { ...base.sp, phase: 'summary', summaryEnteredAt: 1000 },
    };
    // At t=6000 with threshold 5000 -> auto allowed
    const out = computeAdvanceBatch(s, 6000, { intent: 'auto', summaryAutoAdvanceMs: 5000 });
    const types = out.map((e) => e.type);
    expect(types).toContain('sp/deal');
  });

  it('does not auto-advance if below threshold or disabled', () => {
    const s: AppState = {
      ...base,
      rounds: { 1: { state: 'scored', bids: { a: 1, b: 0 }, made: { a: true, b: false } } },
      sp: { ...base.sp, phase: 'summary', summaryEnteredAt: 1000 },
    };
    // Below threshold
    const out1 = computeAdvanceBatch(s, 4000, { intent: 'auto', summaryAutoAdvanceMs: 5000 });
    expect(out1.length).toBe(0);
    // Disabled (0 ms)
    const out2 = computeAdvanceBatch(s, 100000, { intent: 'auto', summaryAutoAdvanceMs: 0 });
    expect(out2.length).toBe(0);
  });
});
