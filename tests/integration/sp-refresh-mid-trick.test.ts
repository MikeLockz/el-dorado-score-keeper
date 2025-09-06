import { describe, it, expect } from 'vitest';
import { initInstance, makeTestDB } from '@/tests/utils/helpers';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';
import { selectSpLiveOverlay, selectSpNextToPlay } from '@/lib/state/selectors';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(type: T, payload: EventPayloadByType<T>, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

describe('SP refresh mid-trick restores seamlessly from state.sp', () => {
  it('rehydrates current trick and next-to-play across instance reload', async () => {
    const dbName = makeTestDB('sp-refresh');

    // First instance: seed to mid-trick
    const a = await initInstance(dbName);
    await a.append(ev('player/added', { id: 'p1', name: 'A' }, 'p1'));
    await a.append(ev('player/added', { id: 'p2', name: 'B' }, 'p2'));
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
              { suit: 'clubs', rank: 3 },
            ],
          },
        },
        'd1',
      ),
    );
    await a.append(ev('sp/leader-set', { leaderId: 'p1' }, 'l1'));
    await a.append(ev('sp/phase-set', { phase: 'playing' }, 'ph'));
    await a.append(ev('sp/trick/played', { playerId: 'p1', card: { suit: 'clubs', rank: 2 } }, 't1'));
    // Close A to simulate a refresh
    a.close();

    // New instance B on same DB should restore mid-trick state
    const b = await initInstance(dbName);
    const s = b.getState();
    const live = selectSpLiveOverlay(s)!;
    expect(live.round).toBe(1);
    expect(live.cards.p1).toEqual({ suit: 'clubs', rank: 2 });
    expect(live.cards.p2).toBeNull();
    expect(selectSpNextToPlay(s)).toBe('p2');
    b.close();
  });
});

