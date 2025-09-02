import { describe, it, expect } from 'vitest';
import { withTabs } from '@/tests/utils/helpers';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(type: T, payload: EventPayloadByType<T>, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

describe('duplicate event across tabs', () => {
  it('applies once when two instances append same eventId', async () => {
    const {
      tabs: [A, B],
      close,
    } = await withTabs(2, { prefix: 'duptab' });
    await A.append(ev('player/added', { id: 'p1', name: 'A' }, 'd0'));

    // Race the same eventId from both
    const e = ev('score/added', { playerId: 'p1', delta: 5 }, 'd1');
    await Promise.allSettled([A.append(e), B.append(e)]);
    await new Promise((res) => setTimeout(res, 0));

    expect(A.getHeight()).toBe(2);
    expect(B.getHeight()).toBe(2);
    expect(A.getState().scores.p1).toBe(5);
    expect(B.getState().scores.p1).toBe(5);
    await close();
  });
});
