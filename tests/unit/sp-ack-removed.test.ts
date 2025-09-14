import { describe, it, expect } from 'vitest';
import { computeAdvanceBatch } from '@/lib/single-player/engine';
import type { AppState } from '@/lib/state/types';

describe('SP: ack removed; reveal flow works without it', () => {
  const base: AppState = {
    players: { a: 'A', b: 'B' },
    scores: {},
    rounds: { 1: { state: 'playing', bids: { a: 0, b: 0 }, made: {} as any } },
    sp: {
      phase: 'playing',
      roundNo: 1,
      dealerId: 'a',
      order: ['a', 'b'],
      trump: 'hearts',
      trumpCard: { suit: 'hearts', rank: 10 },
      hands: { a: [], b: [] },
      trickPlays: [
        { playerId: 'a', card: { suit: 'clubs', rank: 2 } },
        { playerId: 'b', card: { suit: 'clubs', rank: 3 } },
      ],
      trickCounts: { a: 0, b: 0 },
      trumpBroken: false,
      leaderId: 'a',
      reveal: null,
      handPhase: 'idle',
      lastTrickSnapshot: null,
    },
    display_order: { a: 0, b: 1 },
  } as any;

  it('emits reveal-set (no ack)', () => {
    const out = computeAdvanceBatch(base, Date.now());
    const types = out.map((e) => e.type);
    expect(types).toEqual(['sp/trick/reveal-set']);
  });
});
