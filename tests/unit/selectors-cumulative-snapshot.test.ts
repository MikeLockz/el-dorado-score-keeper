import { describe, it, expect } from 'vitest';
import { INITIAL_STATE, reduce, type AppEvent, type AppState } from '@/lib/state/types';
import { selectCumulativeScoresAllRounds } from '@/lib/state/selectors';
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

describe('selectCumulativeScoresAllRounds snapshot (multi-player)', () => {
  it('produces stable cumulative snapshots across rounds', () => {
    let s = INITIAL_STATE;
    s = replay(
      [
        ev('player/added', { id: 'p1', name: 'Alice' }, 'p1'),
        ev('player/added', { id: 'p2', name: 'Bob' }, 'p2'),
        ev('player/added', { id: 'p3', name: 'Cara' }, 'p3'),
        // Round 1 (finalized): p1 +7, p2 -6, p3 missing -> -5
        ev('bid/set', { round: 1, playerId: 'p1', bid: 2 }, 'r1-b1'),
        ev('made/set', { round: 1, playerId: 'p1', made: true }, 'r1-m1'),
        ev('bid/set', { round: 1, playerId: 'p2', bid: 1 }, 'r1-b2'),
        ev('made/set', { round: 1, playerId: 'p2', made: false }, 'r1-m2'),
        ev('round/finalize', { round: 1 }, 'r1-f'),
        // Round 2 (finalized): p1 -5, p2 +8, p3 +5
        ev('bid/set', { round: 2, playerId: 'p1', bid: 0 }, 'r2-b1'),
        ev('made/set', { round: 2, playerId: 'p1', made: false }, 'r2-m1'),
        ev('bid/set', { round: 2, playerId: 'p2', bid: 3 }, 'r2-b2'),
        ev('made/set', { round: 2, playerId: 'p2', made: true }, 'r2-m2'),
        ev('bid/set', { round: 2, playerId: 'p3', bid: 0 }, 'r2-b3'),
        ev('made/set', { round: 2, playerId: 'p3', made: true }, 'r2-m3'),
        ev('round/finalize', { round: 2 }, 'r2-f'),
        // Round 3 (not finalized): p1 +6 (ignored), p2 0 (ignored), p3 -5 (ignored)
        ev('bid/set', { round: 3, playerId: 'p1', bid: 1 }, 'r3-b1'),
        ev('made/set', { round: 3, playerId: 'p1', made: true }, 'r3-m1'),
        ev('bid/set', { round: 3, playerId: 'p3', bid: 0 }, 'r3-b3'),
        ev('made/set', { round: 3, playerId: 'p3', made: false }, 'r3-m3'),
      ],
      s,
    );

    const cum = selectCumulativeScoresAllRounds(s);
    expect(cum).toMatchInlineSnapshot(`
      {
        "1": {
          "p1": 7,
          "p2": -6,
          "p3": -5,
        },
        "10": {
          "p1": 2,
          "p2": 2,
          "p3": 0,
        },
        "2": {
          "p1": 2,
          "p2": 2,
          "p3": 0,
        },
        "3": {
          "p1": 2,
          "p2": 2,
          "p3": 0,
        },
        "4": {
          "p1": 2,
          "p2": 2,
          "p3": 0,
        },
        "5": {
          "p1": 2,
          "p2": 2,
          "p3": 0,
        },
        "6": {
          "p1": 2,
          "p2": 2,
          "p3": 0,
        },
        "7": {
          "p1": 2,
          "p2": 2,
          "p3": 0,
        },
        "8": {
          "p1": 2,
          "p2": 2,
          "p3": 0,
        },
        "9": {
          "p1": 2,
          "p2": 2,
          "p3": 0,
        },
      }
    `);
  });
});
