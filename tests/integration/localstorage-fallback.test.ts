import { describe, it, expect } from 'vitest';
import { makeTestDB, initInstance, drain } from '@/tests/utils/helpers';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(type: T, payload: EventPayloadByType<T>, eventId: string) =>
  makeEvent(type, payload, { eventId, ts: now });

describe('localStorage fallback sync (no BroadcastChannel)', () => {
  it('syncs instances via storage events when channel disabled', async () => {
    const dbName = makeTestDB('ls');
    const A = await initInstance(dbName, `chan-${dbName}`, false);
    const B = await initInstance(dbName, `chan-${dbName}`, false);

    await A.append(ev('player/added', { id: 'p1', name: 'Alice' }, 'lse1'));
    await drain();
    for (let i = 0; i < 50 && B.getHeight() !== 1; i++) await drain();
    expect(B.getHeight()).toBe(1);
    expect(B.getState().players.p1).toBe('Alice');

    await A.append(ev('score/added', { playerId: 'p1', delta: 4 }, 'lse2'));
    await drain();
    for (let i = 0; i < 50 && (B.getState().scores.p1 ?? 0) !== 4; i++) await drain();
    expect(B.getState().scores.p1).toBe(4);

    A.close();
    B.close();
  });
});
