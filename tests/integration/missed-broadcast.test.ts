import { describe, it, expect } from 'vitest';
import { initInstance, makeTestDB, drain } from '@/tests/utils/helpers';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(type: T, payload: EventPayloadByType<T>, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

async function waitUntil(fn: () => boolean, timeoutMs = 200, stepMs = 5) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) break;
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

describe('missed broadcast message', () => {
  it('B lags after dropped message and catches up on next', async () => {
    const dbName = makeTestDB('miss');
    const A = await initInstance(dbName);
    const B = await initInstance(dbName);

    // Seed: ensure both start in sync
    await A.append(ev('player/added', { id: 'p1', name: 'Alice' }, 'm0'));
    await drain();
    await waitUntil(() => B.getHeight() === 1);
    expect(B.getHeight()).toBe(1);

    // Monkey-patch to drop exactly one broadcast call
    const Proto: any = (BroadcastChannel as any).prototype;
    const original = Proto.postMessage;
    let dropped = false;
    Proto.postMessage = function (data: any) {
      if (!dropped && data && data.type === 'append') {
        dropped = true;
        return;
      }
      return original.apply(this, arguments as any);
    };

    // This append's message will be dropped; B should not catch up yet
    await A.append(ev('score/added', { playerId: 'p1', delta: 4 }, 'm1'));
    await drain();
    expect(A.getHeight()).toBe(2);
    expect(B.getHeight()).toBe(1);

    // Restore broadcasting for subsequent messages
    Proto.postMessage = original;

    // Next append should cause B to receive and catch up to both events via tail
    await A.append(ev('score/added', { playerId: 'p1', delta: 6 }, 'm2'));
    await drain();
    await waitUntil(() => B.getHeight() === 3);
    expect(B.getHeight()).toBe(3);
    expect(B.getState().scores.p1).toBe(10);

    A.close();
    B.close();
  });
});
