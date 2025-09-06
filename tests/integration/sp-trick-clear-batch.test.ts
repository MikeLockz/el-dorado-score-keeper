import { describe, it, expect } from 'vitest';
import { initInstance, makeTestDB, seed, drain } from '@/tests/utils/helpers';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';
import { selectSpLiveOverlay, selectSpNextToPlay } from '@/lib/state/selectors';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(type: T, payload: EventPayloadByType<T>, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

describe('SP trick resolution batch', () => {
  it('sets trump-broken (optional), clears trick, and updates leader atomically (single notify)', async () => {
    const dbName = makeTestDB('sp-trick-batch');
    const a = await initInstance(dbName);
    const id = seed('t');

    // Seed roster and SP deal into playing with a known order
    await a.append(ev('player/added', { id: 'p1', name: 'A' }, id()));
    await a.append(ev('player/added', { id: 'p2', name: 'B' }, id()));
    await a.append(
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
              { suit: 'clubs', rank: 2 },
            ],
            p2: [
              { suit: 'diamonds', rank: 3 },
            ],
          },
        },
        id(),
      ),
    );
    // Leader is p1; set playing phase
    await a.append(ev('sp/leader-set', { leaderId: 'p1' }, id()));
    await a.append(ev('sp/phase-set', { phase: 'playing' }, id()));
    // First plays of the trick
    await a.append(ev('sp/trick/played', { playerId: 'p1', card: { suit: 'clubs', rank: 2 } }, id()));
    await a.append(ev('sp/trick/played', { playerId: 'p2', card: { suit: 'diamonds', rank: 3 } }, id()));
    await drain();

    let notifications = 0;
    a.subscribe(() => {
      notifications++;
    });

    // Batch: mark trump broken (optional), clear trick with winner, and update leader
    await a.appendMany([
      ev('sp/trump-broken-set', { broken: true }, id()),
      ev('sp/trick/cleared', { winnerId: 'p2' }, id()),
      ev('sp/leader-set', { leaderId: 'p2' }, id()),
    ]);

    // Expect a single notify for the whole batch
    expect(notifications).toBe(1);

    const s = a.getState();
    const live = selectSpLiveOverlay(s)!;
    // After clear, trick plays are reset and counts incremented for winner
    expect(live.cards.p1).toBeNull();
    expect(live.cards.p2).toBeNull();
    expect(live.counts.p2).toBe(1);
    // Trump is marked broken
    expect((s as any).sp.trumpBroken).toBe(true);
    // Leader updated to winner; next to play equals leader for new trick
    expect((s as any).sp.leaderId).toBe('p2');
    expect(selectSpNextToPlay(s)).toBe('p2');

    a.close();
  });
});

