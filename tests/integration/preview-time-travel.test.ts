import { describe, it, expect } from 'vitest';
import { initInstance, makeTestDB } from '@/tests/utils/helpers';
import { previewAt } from '@/lib/state/io';
import { reduce, INITIAL_STATE, type AppEvent } from '@/lib/state/types';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(
  type: T,
  payload: EventPayloadByType<T>,
  id: string,
): AppEvent => makeEvent(type, payload, { eventId: id, ts: now });

function replayTo(events: AppEvent[], h: number): any {
  let s = INITIAL_STATE;
  for (let i = 0; i < h && i < events.length; i++) s = reduce(s, events[i]);
  return s;
}

describe('time travel preview', () => {
  it('previewAt(h) equals exact replay to height', async () => {
    const dbName = makeTestDB('tt');
    const inst = await initInstance(dbName);
    const events: AppEvent[] = [
      ev('player/added', { id: 'p1', name: 'A' }, 't1'),
      ev('score/added', { playerId: 'p1', delta: 2 }, 't2'),
      ev('score/added', { playerId: 'p1', delta: 5 }, 't3'),
      ev('bid/set', { round: 1, playerId: 'p1', bid: 3 }, 't4'),
      ev('made/set', { round: 1, playerId: 'p1', made: true }, 't5'),
      ev('round/finalize', { round: 1 }, 't6'),
    ];
    for (const e of events) await inst.append(e);
    const H = inst.getHeight();

    for (let h = 0; h <= H; h++) {
      const prev = await previewAt(dbName, h);
      const expected = replayTo(events, h);
      const strip = (s: any) => ({
        players: s.players,
        scores: s.scores,
        rounds: s.rounds,
        display_order: s.display_order,
        sp: s.sp,
      });
      expect(strip(prev)).toEqual(strip(expected));
    }

    inst.close();
  });
});
