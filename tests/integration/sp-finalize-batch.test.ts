import { describe, it, expect } from 'vitest';
import { initInstance, makeTestDB, seed, drain } from '@/tests/utils/helpers';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(type: T, payload: EventPayloadByType<T>, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

describe('SP finalize + next-round batch', () => {
  it('applies scoring, sets phase done, and deals next round atomically (single notify)', async () => {
    const dbName = makeTestDB('sp-batch');
    const a = await initInstance(dbName);
    const id = seed('e');

    // Seed roster and round 1 bidding
    await a.append(ev('player/added', { id: 'p1', name: 'A' }, id()));
    await a.append(ev('player/added', { id: 'p2', name: 'B' }, id()));
    await a.append(ev('bid/set', { round: 1, playerId: 'p1', bid: 1 }, id()));
    await a.append(ev('bid/set', { round: 1, playerId: 'p2', bid: 0 }, id()));
    await drain();

    let notifications = 0;
    a.subscribe(() => {
      notifications++;
    });

    // Build a finalize+next-round batch similar to the UI
    const batch = [
      ev('made/set', { round: 1, playerId: 'p1', made: true }, id()),
      ev('made/set', { round: 1, playerId: 'p2', made: true }, id()),
      ev('sp/phase-set', { phase: 'done' }, id()),
      ev('round/finalize', { round: 1 }, id()),
      // Next round deal in same batch
      ev(
        'sp/deal',
        {
          roundNo: 2,
          dealerId: 'p2',
          order: ['p2', 'p1'],
          trump: 'hearts',
          trumpCard: { suit: 'hearts', rank: 12 },
          hands: { p1: [], p2: [] },
        },
        id(),
      ),
      ev('sp/leader-set', { leaderId: 'p2' }, id()),
      ev('sp/phase-set', { phase: 'bidding' }, id()),
      ev('round/state-set', { round: 2, state: 'bidding' }, id()),
    ];

    await a.appendMany(batch);

    // Expect a single notify for the whole batch
    expect(notifications).toBe(1);

    const s = a.getState();
    // Current round is now 2 in SP runtime
    expect(s.sp.roundNo).toBe(2);
    expect(s.sp.phase).toBe('bidding');
    expect(s.rounds[1]?.state).toBe('scored');
    expect(s.rounds[2]?.state).toBe('bidding');
    expect(s.sp.order).toEqual(['p2', 'p1']);

    a.close();
  });
});
