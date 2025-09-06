import { describe, it, expect } from 'vitest';
import { makeEvent } from '@/lib/state/events';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';

const now = 1_700_000_000_000;
const ev = (type: any, payload: any, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

function replay(list: any[], base: AppState = INITIAL_STATE): AppState {
  return list.reduce((s, e) => reduce(s, e), base);
}

describe('SP event idempotency semantics', () => {
  it('sp/trick/played: duplicate play by same player in a trick is ignored', () => {
    let s = replay([
      ev('player/added', { id: 'a', name: 'A' }, 'p1'),
      ev('player/added', { id: 'b', name: 'B' }, 'p2'),
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'b',
          order: ['b', 'a'],
          trump: 'hearts',
          trumpCard: { suit: 'hearts', rank: 12 },
          hands: { a: [{ suit: 'clubs', rank: 2 }], b: [{ suit: 'diamonds', rank: 3 }] },
        },
        'd1',
      ),
      // Set leader to the player who will play first to focus purely on idempotency
      ev('sp/leader-set', { leaderId: 'a' }, 'l1'),
      ev('sp/phase-set', { phase: 'playing' }, 'ph'),
    ]);
    const play = ev('sp/trick/played', { playerId: 'a', card: { suit: 'clubs', rank: 2 } }, 't1');
    s = reduce(s, play);
    const afterOnce = s;
    s = reduce(s, { ...play, eventId: 't1-dup' });
    // Still one play; hand not decremented twice
    expect(s.sp.trickPlays.length).toBe(1);
    expect(s.sp.trickPlays[0]?.playerId).toBe('a');
    expect((s.sp.hands['a'] ?? []).length).toBe((afterOnce.sp.hands['a'] ?? []).length);
  });

  it('sp/trick/cleared: duplicate clear without intervening plays is ignored', () => {
    let s = replay([
      ev('player/added', { id: 'a', name: 'A' }, 'q1'),
      ev('player/added', { id: 'b', name: 'B' }, 'q2'),
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'a',
          order: ['a', 'b'],
          trump: 'spades',
          trumpCard: { suit: 'spades', rank: 11 },
          hands: { a: [{ suit: 'clubs', rank: 2 }], b: [{ suit: 'clubs', rank: 3 }] },
        },
        'qd',
      ),
      ev('sp/leader-set', { leaderId: 'a' }, 'ql'),
      ev('sp/phase-set', { phase: 'playing' }, 'qph'),
      ev('sp/trick/played', { playerId: 'a', card: { suit: 'clubs', rank: 2 } }, 'qt1'),
      ev('sp/trick/played', { playerId: 'b', card: { suit: 'clubs', rank: 3 } }, 'qt2'),
    ]);
    s = replay([ev('sp/trick/cleared', { winnerId: 'b' }, 'qc1')], s);
    const afterFirst = s.sp.trickCounts['b'] ?? 0;
    s = replay([ev('sp/trick/cleared', { winnerId: 'b' }, 'qc2')], s);
    expect(s.sp.trickPlays.length).toBe(0);
    expect(s.sp.trickCounts['b']).toBe(afterFirst);
  });

  it('sp/trick/cleared before any plays has no effect', () => {
    let s = replay([
      ev('player/added', { id: 'a', name: 'A' }, 'r1'),
      ev('player/added', { id: 'b', name: 'B' }, 'r2'),
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'a',
          order: ['a', 'b'],
          trump: 'clubs',
          trumpCard: { suit: 'clubs', rank: 10 },
          hands: { a: [], b: [] },
        },
        'rd',
      ),
      ev('sp/leader-set', { leaderId: 'a' }, 'rl'),
      ev('sp/phase-set', { phase: 'playing' }, 'rph'),
    ]);
    const before = s;
    s = replay([ev('sp/trick/cleared', { winnerId: 'a' }, 'rc')], s);
    expect(s).toEqual(before);
  });
});
