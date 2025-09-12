import { describe, it, expect } from 'vitest';
import { makeEvent } from '@/lib/state/events';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';

const now = 1_700_000_000_000;
const ev = (type: any, payload: any, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

function replay(list: any[], base: AppState = INITIAL_STATE): AppState {
  return list.reduce((s, e) => reduce(s, e), base);
}

describe('SP lastTrickSnapshot lifecycle', () => {
  it('sets on reveal, preserves through clear, and clears on next first play', () => {
    let s = replay([
      ev('player/added', { id: 'a', name: 'A' }, 'a1'),
      ev('player/added', { id: 'b', name: 'B' }, 'a2'),
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'a',
          order: ['a', 'b'],
          trump: 'hearts',
          trumpCard: { suit: 'hearts', rank: 12 },
          hands: { a: [{ suit: 'clubs', rank: 2 }], b: [{ suit: 'clubs', rank: 3 }] },
        },
        'd1',
      ),
      ev('sp/leader-set', { leaderId: 'a' }, 'l1'),
      ev('sp/phase-set', { phase: 'playing' }, 'ph'),
      ev('sp/trick/played', { playerId: 'a', card: { suit: 'clubs', rank: 2 } }, 't1'),
      ev('sp/trick/played', { playerId: 'b', card: { suit: 'clubs', rank: 3 } }, 't2'),
    ]);
    // Set reveal (winner b)
    s = replay([ev('sp/trick/reveal-set', { winnerId: 'b' }, 'rv')], s);
    expect(s.sp.lastTrickSnapshot).not.toBeNull();
    const snap = s.sp.lastTrickSnapshot!;
    expect(snap.ledBy).toBe('a');
    expect(snap.plays.length).toBe(2);
    expect(snap.plays[0]?.playerId).toBe('a');
    expect(snap.winnerId).toBe('b');

    // Clear trick should preserve snapshot
    s = replay([ev('sp/trick/cleared', { winnerId: 'b' }, 'cl')], s);
    expect(s.sp.lastTrickSnapshot).not.toBeNull();

    // First play of next trick clears snapshot
    s = replay([ev('sp/trick/played', { playerId: 'a', card: { suit: 'hearts', rank: 12 } }, 'n1')], s);
    expect(s.sp.lastTrickSnapshot).toBeNull();
  });
});

