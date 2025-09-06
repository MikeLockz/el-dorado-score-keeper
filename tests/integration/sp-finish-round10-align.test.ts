import { describe, it, expect } from 'vitest';
import { initInstance, makeTestDB, seed, drain } from '@/tests/utils/helpers';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(type: T, payload: EventPayloadByType<T>, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

describe('Finish Round 10 → Round 10 scored; Round 9 bidding (no flicker)', () => {
  it('finalizes r10 and toggles r9 to bidding in one batch (single notify)', async () => {
    const dbName = makeTestDB('sp-r10-align');
    const a = await initInstance(dbName);
    const id = seed('r');

    // Seed two players and bids for round 10
    await a.append(ev('player/added', { id: 'p1', name: 'A' }, id()));
    await a.append(ev('player/added', { id: 'p2', name: 'B' }, id()));
    await a.append(ev('bid/set', { round: 10, playerId: 'p1', bid: 1 }, id()));
    await a.append(ev('bid/set', { round: 10, playerId: 'p2', bid: 0 }, id()));
    await drain();

    let notifications = 0;
    a.subscribe(() => {
      notifications++;
    });

    // Batch: mark made, finalize r10, set SP done, and align the scorecard so r9 is bidding
    await a.appendMany([
      ev('made/set', { round: 10, playerId: 'p1', made: true }, id()),
      ev('made/set', { round: 10, playerId: 'p2', made: true }, id()),
      ev('sp/phase-set', { phase: 'done' }, id()),
      ev('round/finalize', { round: 10 }, id()),
      // Align: previous round becomes the active bidding row for edits
      ev('round/state-set', { round: 9, state: 'bidding' }, id()),
    ]);

    // Expect a single notify for the whole batch (no flicker)
    expect(notifications).toBe(1);

    const s = a.getState();
    expect(s.sp.phase).toBe('done');
    expect(s.rounds[10]?.state).toBe('scored');
    expect(s.rounds[9]?.state).toBe('bidding');

    a.close();
  });
});

