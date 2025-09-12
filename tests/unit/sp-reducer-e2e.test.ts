import { describe, it, expect } from 'vitest';
import { makeEvent } from '@/lib/state/events';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';
import {
  selectSpIsRoundDone,
  selectSpTricksForRound,
  selectSpLiveOverlay,
} from '@/lib/state/selectors';

const now = 1_700_000_000_000;
const ev = (type: any, payload: any, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

function replay(list: any[], base: AppState = INITIAL_STATE): AppState {
  return list.reduce((s, e) => reduce(s, e), base);
}

describe('SP reducer e2e: deal → play → clear → finalize', () => {
  it('flows through phases and scoring deterministically', () => {
    // Setup players and deal round 1
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
          hands: {
            a: [{ suit: 'clubs', rank: 2 }],
            b: [{ suit: 'clubs', rank: 3 }],
          },
        },
        'd1',
      ),
      ev('sp/leader-set', { leaderId: 'a' }, 'l1'),
    ]);

    // Enter playing via bids
    s = replay(
      [
        ev('bid/set', { round: 1, playerId: 'a', bid: 1 }, 'ba'),
        ev('bid/set', { round: 1, playerId: 'b', bid: 0 }, 'bb'),
        ev('round/state-set', { round: 1, state: 'playing' }, 'rs'),
        ev('sp/phase-set', { phase: 'playing' }, 'ph'),
      ],
      s,
    );

    // First play and overlay
    s = replay(
      [ev('sp/trick/played', { playerId: 'a', card: { suit: 'clubs', rank: 2 } }, 't1')],
      s,
    );
    const live1 = selectSpLiveOverlay(s)!;
    expect(live1.cards.a).toEqual({ suit: 'clubs', rank: 2 });
    expect(live1.cards.b).toBeNull();
    expect(selectSpIsRoundDone(s)).toBe(false);

    // Second play, reveal increments, then clear and set leader; counts persist
    s = replay(
      [
        ev('sp/trick/played', { playerId: 'b', card: { suit: 'clubs', rank: 3 } }, 't2'),
        ev('sp/trick/reveal-set', { winnerId: 'b' }, 'rev'),
      ],
      s,
    );
    const live2 = selectSpLiveOverlay(s)!;
    expect(live2.counts.b).toBe(1);
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
    expect(selectSpTricksForRound(s)).toBe(10); // round 1 -> 10 tricks

    // For brevity, finalize scoring row and ensure next round set to bidding
    s = replay(
      [
        ev('made/set', { round: 1, playerId: 'a', made: false }, 'ma'),
        ev('made/set', { round: 1, playerId: 'b', made: true }, 'mb'),
        ev('round/finalize', { round: 1 }, 'f1'),
      ],
      s,
    );
    expect(s.rounds[1]?.state).toBe('scored');
    expect(s.rounds[2]?.state).toBe('bidding');
  });
});
