import { describe, it, expect } from 'vitest';
import { makeEvent } from '@/lib/state/events';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';
import {
  selectSpRotatedOrder,
  selectSpNextToPlay,
  selectSpLiveOverlay,
  selectSpTrumpInfo,
  selectSpDealerName,
  selectSpIsRoundDone,
  selectSpTricksForRound,
} from '@/lib/state/selectors';

const now = 1_700_000_000_000;
const ev = (type: any, payload: any, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

function replay(list: any[], base: AppState = INITIAL_STATE): AppState {
  return list.reduce((s, e) => reduce(s, e), base);
}

describe('single-player reducers + selectors flows', () => {
  it('deal sets trump/dealer/order; selectors reflect trump info and dealer name', () => {
    const s = replay([
      ev('player/added', { id: 'a', name: 'Alice' }, 'p1'),
      ev('player/added', { id: 'b', name: 'Bob' }, 'p2'),
      ev('player/added', { id: 'c', name: 'Cara' }, 'p3'),
      ev('player/added', { id: 'd', name: 'Dan' }, 'p4'),
      ev(
        'sp/deal',
        {
          roundNo: 5,
          dealerId: 'd',
          order: ['d', 'a', 'b', 'c'],
          trump: 'diamonds',
          trumpCard: { suit: 'diamonds', rank: 11 },
          hands: { a: [], b: [], c: [], d: [] },
        },
        'd1',
      ),
      ev('sp/leader-set', { leaderId: 'a' }, 'l1'),
    ]);
    const info = selectSpTrumpInfo(s);
    expect(info.round).toBe(5);
    expect(info.leaderId).toBe('a');
    expect(info.trump).toBe('diamonds');
    expect(info.trumpCard).toEqual({ suit: 'diamonds', rank: 11 });
    expect(selectSpDealerName(s)).toBe('Dan');
    expect(selectSpTricksForRound(s)).toBe(6); // r5 -> 6 cards
  });

  it('rotated order and next-to-play advance with trick plays', () => {
    let s = replay([
      ev('player/added', { id: 'a', name: 'A' }, 'p1'),
      ev('player/added', { id: 'b', name: 'B' }, 'p2'),
      ev('player/added', { id: 'c', name: 'C' }, 'p3'),
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'a',
          order: ['a', 'b', 'c'],
          trump: 'spades',
          trumpCard: { suit: 'spades', rank: 14 },
          hands: {
            a: [{ suit: 'hearts', rank: 10 }],
            b: [{ suit: 'hearts', rank: 9 }],
            c: [{ suit: 'clubs', rank: 2 }],
          },
        },
        'd1',
      ),
      ev('sp/leader-set', { leaderId: 'b' }, 'l1'),
    ]);
    // before playing phase, next-to-play is null
    expect(selectSpRotatedOrder(s)).toEqual(['b', 'c', 'a']);
    expect(selectSpNextToPlay(s)).toBeNull();
    // enter playing phase
    s = replay([ev('sp/phase-set', { phase: 'playing' }, 'ph')], s);
    expect(selectSpNextToPlay(s)).toBe('b');
    // play b -> next is c
    s = replay(
      [ev('sp/trick/played', { playerId: 'b', card: { suit: 'hearts', rank: 9 } }, 't1')],
      s,
    );
    expect(selectSpNextToPlay(s)).toBe('c');
    // play c -> next is a
    s = replay(
      [ev('sp/trick/played', { playerId: 'c', card: { suit: 'clubs', rank: 2 } }, 't2')],
      s,
    );
    expect(selectSpNextToPlay(s)).toBe('a');
  });

  it('live overlay shows current trick and trick counts; reveal increments winner', () => {
    let s = replay([
      ev('player/added', { id: 'a', name: 'A' }, 'p1'),
      ev('player/added', { id: 'b', name: 'B' }, 'p2'),
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
    ]);
    const live1 = selectSpLiveOverlay(s)!;
    expect(live1.currentPlayerId).toBe('b');
    expect(live1.cards.a).toEqual({ suit: 'clubs', rank: 2 });
    expect(live1.cards.b).toBeNull();
    expect(live1.counts.a ?? 0).toBe(0);
    // Finish trick, enter reveal, then clear and set next leader
    s = replay(
      [
        ev('sp/trick/played', { playerId: 'b', card: { suit: 'clubs', rank: 3 } }, 't2'),
        ev('sp/trick/reveal-set', { winnerId: 'b' }, 'rev'),
      ],
      s,
    );
    const live2 = selectSpLiveOverlay(s)!;
    expect(live2.counts.b).toBe(1); // incremented at reveal
    // Now clear and advance leader; counts stay the same
    s = replay(
      [
        ev('sp/trick/cleared', { winnerId: 'b' }, 'tc'),
        ev('sp/leader-set', { leaderId: 'b' }, 'l2'),
      ],
      s,
    );
    const live3 = selectSpLiveOverlay(s)!;
    expect(live3.cards.a).toBeNull();
    expect(live3.cards.b).toBeNull();
    expect(live3.counts.b).toBe(1);
  });

  it('trump-broken flag toggles and round-done flips when counts meet tricks', () => {
    let s = replay([
      ev('player/added', { id: 'a', name: 'A' }, 'p1'),
      ev('player/added', { id: 'b', name: 'B' }, 'p2'),
      ev(
        'sp/deal',
        {
          roundNo: 10,
          dealerId: 'a',
          order: ['a', 'b'],
          trump: 'spades',
          trumpCard: { suit: 'spades', rank: 11 },
          hands: { a: [], b: [] },
        },
        'd1',
      ),
    ]);
    expect(selectSpIsRoundDone(s)).toBe(false);
    // mark trump broken
    s = replay([ev('sp/trump-broken-set', { broken: true }, 'tb')], s);
    // not a selector, but we can check via overlay source fields
    const live = selectSpLiveOverlay(s);
    expect((s as any).sp.trumpBroken).toBe(true);
    // play out a full trick then clear (only 1 trick in r10)
    s = replay(
      [
        ev('sp/trick/played', { playerId: 'a', card: { suit: 'clubs', rank: 2 } }, 'tp1'),
        ev('sp/trick/played', { playerId: 'b', card: { suit: 'clubs', rank: 3 } }, 'tp2'),
        ev('sp/trick/reveal-set', { winnerId: 'a' }, 'rv1'),
        ev('sp/trick/cleared', { winnerId: 'a' }, 'tc1'),
      ],
      s,
    );
    expect(selectSpIsRoundDone(s)).toBe(true);
    expect(selectSpTricksForRound(s)).toBe(1);
  });
});
