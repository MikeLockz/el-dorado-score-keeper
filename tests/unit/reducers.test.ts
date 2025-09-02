import { describe, it, expect } from 'vitest';
import { INITIAL_STATE, reduce, type AppEvent, type AppState } from '@/lib/state/types';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(
  type: T,
  payload: EventPayloadByType<T>,
  id: string,
): AppEvent => makeEvent(type, payload, { eventId: id, ts: now });

function replay(events: AppEvent[], base: AppState = INITIAL_STATE): AppState {
  return events.reduce((s, e) => reduce(s, e), base);
}

describe('reducers', () => {
  it('deterministically applies player and score events', () => {
    const events: AppEvent[] = [
      ev('player/added', { id: 'p1', name: 'Alice' }, 'e1'),
      ev('score/added', { playerId: 'p1', delta: 7 }, 'e2'),
      ev('score/added', { playerId: 'p1', delta: 3 }, 'e3'),
    ];
    const s1 = replay(events);
    const s2 = replay(events);
    expect(s1).toEqual(s2);
    expect(s1.players).toEqual({ p1: 'Alice' });
    expect(s1.scores).toEqual({ p1: 10 });
  });

  it('ignores duplicate player/added for same id', () => {
    const events: AppEvent[] = [
      ev('player/added', { id: 'p1', name: 'Alice' }, 'e1'),
      ev('player/added', { id: 'p1', name: 'Alice Again' }, 'e2'),
    ];
    const s = replay(events);
    expect(s.players).toEqual({ p1: 'Alice' });
  });

  it('clamps bids within round limits and records made', () => {
    // round 1 max tricks = 10, round 10 max = 1
    let s = INITIAL_STATE;
    s = reduce(s, ev('player/added', { id: 'p1', name: 'A' }, 'e1'));
    s = reduce(s, ev('bid/set', { round: 1, playerId: 'p1', bid: 50 }, 'e2'));
    s = reduce(s, ev('made/set', { round: 1, playerId: 'p1', made: true }, 'e3'));
    expect(s.rounds[1].bids.p1).toBe(10);
    expect(s.rounds[1].made.p1).toBe(true);
  });

  it('finalizes a round, applies scores, and advances next round to bidding', () => {
    let s = INITIAL_STATE;
    s = reduce(s, ev('player/added', { id: 'p1', name: 'A' }, 'e1'));
    s = reduce(s, ev('player/added', { id: 'p2', name: 'B' }, 'e2'));
    s = reduce(s, ev('bid/set', { round: 1, playerId: 'p1', bid: 2 }, 'e3'));
    s = reduce(s, ev('bid/set', { round: 1, playerId: 'p2', bid: 1 }, 'e4'));
    s = reduce(s, ev('made/set', { round: 1, playerId: 'p1', made: true }, 'e5'));
    s = reduce(s, ev('made/set', { round: 1, playerId: 'p2', made: false }, 'e6'));
    s = reduce(s, ev('round/finalize', { round: 1 }, 'e7'));
    // p1: +(5+2)=7, p2: -(5+1)=-6
    expect(s.scores).toEqual({ p1: 7, p2: -6 });
    expect(s.rounds[1].state).toBe('scored');
    expect(s.rounds[2].state).toBe('bidding');
  });

  it('renames and removes players via events', () => {
    let s = INITIAL_STATE;
    s = reduce(s, ev('player/added', { id: 'p1', name: 'Alice' }, 'x1'));
    s = reduce(s, ev('player/added', { id: 'p2', name: 'Bob' }, 'x2'));
    s = reduce(s, ev('player/renamed', { id: 'p2', name: 'Bobby' }, 'x3'));
    expect(s.players).toEqual({ p1: 'Alice', p2: 'Bobby' });
    // add some bids/made and scores
    s = reduce(s, ev('bid/set', { round: 1, playerId: 'p2', bid: 3 }, 'x4'));
    s = reduce(s, ev('made/set', { round: 1, playerId: 'p2', made: true }, 'x5'));
    s = reduce(s, ev('score/added', { playerId: 'p2', delta: 5 }, 'x6'));
    // remove p2
    s = reduce(s, ev('player/removed', { id: 'p2' }, 'x7'));
    expect(s.players).toEqual({ p1: 'Alice' });
    expect(s.scores.p2).toBeUndefined();
    expect(s.rounds[1].bids.p2).toBeUndefined();
    expect(s.rounds[1].made.p2).toBeUndefined();
  });
});
