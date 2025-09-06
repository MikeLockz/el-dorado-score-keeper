import { describe, it, expect } from 'vitest';
import { initInstance, makeTestDB, seed, drain } from '@/tests/utils/helpers';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';
import { selectSpNextToPlay } from '@/lib/state/selectors';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(type: T, payload: EventPayloadByType<T>, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

describe('SP bidding confirmation batch', () => {
  it('sets human bid, auto-bids bots, and transitions to playing atomically (single notify)', async () => {
    const dbName = makeTestDB('sp-bid-batch');
    const a = await initInstance(dbName);
    const id = seed('e');

    // Seed roster and SP deal into bidding
    await a.append(ev('player/added', { id: 'p1', name: 'Human' }, id()));
    await a.append(ev('player/added', { id: 'p2', name: 'Bot' }, id()));
    await a.append(
      ev(
        'sp/deal',
        {
          roundNo: 1,
          dealerId: 'p2',
          order: ['p2', 'p1'],
          trump: 'spades',
          trumpCard: { suit: 'spades', rank: 14 },
          hands: { p1: [], p2: [] },
        },
        id(),
      ),
    );
    // Leader (first to act) aligns to order[0]
    await a.append(ev('sp/leader-set', { leaderId: 'p2' }, id()));
    await drain();

    let notifications = 0;
    a.subscribe(() => {
      notifications++;
    });

    // Batch: human confirms bid; add missing bot bid; transition to playing
    await a.appendMany([
      ev('bid/set', { round: 1, playerId: 'p1', bid: 2 }, id()),
      ev('bid/set', { round: 1, playerId: 'p2', bid: 1 }, id()),
      ev('round/state-set', { round: 1, state: 'playing' }, id()),
      ev('sp/phase-set', { phase: 'playing' }, id()),
    ]);

    // Expect single notify for whole batch
    expect(notifications).toBe(1);

    const s = a.getState();
    expect(s.rounds[1]?.bids?.p1).toBe(2);
    expect(s.rounds[1]?.bids?.p2).toBe(1);
    expect(s.rounds[1]?.state).toBe('playing');
    expect(s.sp.phase).toBe('playing');
    // Next to play equals leader when no trick plays yet
    expect(selectSpNextToPlay(s)).toBe('p2');

    a.close();
  });
});
