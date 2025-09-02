import { describe, it, expect } from 'vitest';
import { initInstance, makeTestDB } from '@/tests/utils/helpers';
import { exportBundle, importBundle } from '@/lib/state/io';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';

const now = 1_700_000_000_000;
function ev<T extends AppEventType>(type: T, payload: EventPayloadByType<T>, eventId: string) {
  return makeEvent(type, payload, { eventId, ts: now });
}

describe('export/import round trip', () => {
  it('restores state and height from exported events', async () => {
    const dbName = makeTestDB('exp');
    const a = await initInstance(dbName);
    await a.append(ev('player/added', { id: 'p1', name: 'A' }, 'ee1'));
    await a.append(ev('player/added', { id: 'p2', name: 'B' }, 'ee2'));
    await a.append(ev('score/added', { playerId: 'p1', delta: 5 }, 'ee3'));
    await a.append(ev('score/added', { playerId: 'p2', delta: 7 }, 'ee4'));

    const bundle = await exportBundle(dbName);
    expect(bundle.latestSeq).toBe(4);
    expect(bundle.events).toHaveLength(4);
    a.close();

    const dbName2 = `${dbName}-imported`;
    await importBundle(dbName2, bundle);
    const b = await initInstance(dbName2);
    expect(b.getHeight()).toBe(4);
    expect(b.getState().players).toEqual({ p1: 'A', p2: 'B' });
    expect(b.getState().scores).toEqual({ p1: 5, p2: 7 });
    b.close();
  });
});
