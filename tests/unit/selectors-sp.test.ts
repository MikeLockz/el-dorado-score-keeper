import { describe, it, expect } from 'vitest';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';
import { makeEvent, events } from '@/lib/state/events';
import {
  selectSpTricksForRound,
  selectSpIsRoundDone,
  selectSpHandBySuit,
} from '@/lib/state/selectors';

const now = 1_700_000_000_000;
const ev = (type: any, payload: any, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

function replay(list: any[], base: AppState = INITIAL_STATE): AppState {
  return list.reduce((s, e) => reduce(s, e), base);
}

describe('single-player selectors', () => {
  it('selectSpTricksForRound reflects current round', () => {
    const base = replay([
      ev('player/added', { id: 'p1', name: 'A' }, 'a1'),
      ev('player/added', { id: 'p2', name: 'B' }, 'a2'),
      ev('player/added', { id: 'p3', name: 'C' }, 'a3'),
      ev('player/added', { id: 'p4', name: 'D' }, 'a4'),
      ev(
        'sp/deal',
        {
          roundNo: 3,
          dealerId: 'p1',
          order: ['p1', 'p2', 'p3', 'p4'],
          trump: 'hearts',
          trumpCard: { suit: 'hearts', rank: 12 },
          hands: { p1: [], p2: [], p3: [], p4: [] },
        },
        'd1',
      ),
    ]);
    expect(selectSpTricksForRound(base)).toBe(8); // round 3 -> 8 tricks
  });

  it('selectSpHandBySuit groups and sorts by rank desc', () => {
    const s = replay([
      ev('player/added', { id: 'p1', name: 'A' }, 'b1'),
      ev('player/added', { id: 'p2', name: 'B' }, 'b2'),
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'p1',
          order: ['p1', 'p2'],
          trump: 'spades',
          trumpCard: { suit: 'spades', rank: 14 },
          hands: {
            p1: [
              { suit: 'hearts', rank: 10 },
              { suit: 'hearts', rank: 12 },
              { suit: 'clubs', rank: 2 },
              { suit: 'spades', rank: 11 },
            ],
            p2: [],
          },
        },
        'd2',
      ),
    ]);
    const grouped = selectSpHandBySuit(s, 'p1');
    expect(grouped.hearts.map((c) => c.rank)).toEqual([12, 10]);
    expect(grouped.clubs.map((c) => c.rank)).toEqual([2]);
    expect(grouped.spades.map((c) => c.rank)).toEqual([11]);
    expect(grouped.diamonds.length).toBe(0);
  });

  it('selectSpIsRoundDone when trickCounts sum meets tricksForRound', () => {
    let s = replay([
      ev('player/added', { id: 'p1', name: 'A' }, 'c1'),
      ev('player/added', { id: 'p2', name: 'B' }, 'c2'),
      ev('player/added', { id: 'p3', name: 'C' }, 'c3'),
      ev('player/added', { id: 'p4', name: 'D' }, 'c4'),
      events.spDeal(
        {
          roundNo: 3, // 8 tricks total
          dealerId: 'p1',
          order: ['p1', 'p2', 'p3', 'p4'],
          trump: 'clubs',
          trumpCard: { suit: 'clubs', rank: 9 },
          hands: { p1: [], p2: [], p3: [], p4: [] },
        },
        { eventId: 'd3', ts: now },
      ),
    ]);
    // Initially no tricks resolved
    expect(selectSpIsRoundDone(s)).toBe(false);
    // Award 7 tricks total so far, simulate plays before each clear
    const winners = ['p1', 'p2', 'p3', 'p4', 'p1', 'p2', 'p3'];
    for (let i = 0; i < winners.length; i++) {
      s = replay(
        [
          ev('sp/trick/played', { playerId: 'p1', card: { suit: 'clubs', rank: 2 } }, `tp${i}-1`),
          ev('sp/trick/played', { playerId: 'p2', card: { suit: 'clubs', rank: 3 } }, `tp${i}-2`),
          ev('sp/trick/played', { playerId: 'p3', card: { suit: 'clubs', rank: 4 } }, `tp${i}-3`),
          ev('sp/trick/played', { playerId: 'p4', card: { suit: 'clubs', rank: 5 } }, `tp${i}-4`),
          ev('sp/trick/reveal-set', { winnerId: winners[i]! }, `rw${i}`),
          ev('sp/trick/cleared', { winnerId: winners[i]! }, `w${i}`),
        ],
        s,
      );
    }
    expect(selectSpIsRoundDone(s)).toBe(false);
    // One more trick -> meets 8
    s = replay(
      [
        ev('sp/trick/played', { playerId: 'p1', card: { suit: 'clubs', rank: 6 } }, 'tp7-1'),
        ev('sp/trick/played', { playerId: 'p2', card: { suit: 'clubs', rank: 7 } }, 'tp7-2'),
        ev('sp/trick/played', { playerId: 'p3', card: { suit: 'clubs', rank: 8 } }, 'tp7-3'),
        ev('sp/trick/played', { playerId: 'p4', card: { suit: 'clubs', rank: 9 } }, 'tp7-4'),
        ev('sp/trick/reveal-set', { winnerId: 'p4' }, 'rw7'),
        ev('sp/trick/cleared', { winnerId: 'p4' }, 'w7'),
      ],
      s,
    );
    expect(selectSpIsRoundDone(s)).toBe(true);
  });
});
