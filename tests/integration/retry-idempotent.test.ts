import { describe, it, expect } from 'vitest';
import { initInstance, makeTestDB } from '@/tests/utils/helpers';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(type: T, payload: EventPayloadByType<T>, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

describe('idempotent retry on transient errors', () => {
  it('generic error then retry with same eventId results in single write', async () => {
    const dbName = makeTestDB('retry');
    const a = await initInstance(dbName);
    await a.append(ev('player/added', { id: 'p1', name: 'A' }, 'r0'));
    (a as any).setTestAppendFailure('generic');
    const e = ev('score/added', { playerId: 'p1', delta: 3 }, 'r1');
    await expect(a.append(e)).rejects.toBeTruthy();
    // retry with same id
    const seq = await a.append(e);
    expect(a.getHeight()).toBe(seq);
    expect(a.getState().scores.p1).toBe(3);

    // Count events in DB == 2 (player + score)
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(dbName);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction(['events'], 'readonly');
    const count = await new Promise<number>((res, rej) => {
      const req = tx.objectStore('events').count();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    db.close();
    a.close();
    expect(count).toBe(2);
  });

  it('quota error does not change height; retry succeeds once', async () => {
    const dbName = makeTestDB('quota');
    const a = await initInstance(dbName);
    const baseH = a.getHeight();
    (a as any).setTestAppendFailure('quota');
    const e = ev('player/added', { id: 'pX', name: 'Q' }, 'q1');
    await expect(a.append(e)).rejects.toHaveProperty('name', 'QuotaExceededError');
    expect(a.getHeight()).toBe(baseH);
    // retry same
    await a.append(e);
    expect(a.getState().players.pX).toBe('Q');
    a.close();
  });
});
