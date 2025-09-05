import { describe, it, expect } from 'vitest';
import { createInstance } from '@/lib/state/instance';
import { makeEvent } from '@/lib/state/events';
import { openDB, storeNames, tx } from '@/lib/state/db';

function makeDbName(prefix = 'snap-heur') {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function listSnapshotHeights(dbName: string): Promise<number[]> {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(dbName);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const t = db.transaction(['snapshots'], 'readonly');
  const curReq = t.objectStore('snapshots').openCursor();
  const heights: number[] = [];
  await new Promise<void>((res) => {
    curReq.onsuccess = () => {
      const c = curReq.result;
      if (!c) return res();
      heights.push((c.value as any).height as number);
      c.continue();
    };
    curReq.onerror = () => res();
  });
  db.close();
  return heights.sort((a, b) => a - b);
}

async function seedEvents(dbName: string, n: number) {
  const db = await openDB(dbName);
  const t = tx(db, 'readwrite', [storeNames.EVENTS]);
  const store = t.objectStore(storeNames.EVENTS);
  const baseTs = 1_700_000_000_000;
  for (let i = 1; i <= n; i++) {
    const ev = makeEvent('score/added', { playerId: 'p1', delta: 1 }, {
      eventId: `seed-${i}`,
      ts: baseTs + i,
    });
    // Add without caring about seq key (autoIncrement)
    const req = store.add(ev);
    // eslint-disable-next-line no-await-in-loop
    await new Promise<void>((res, rej) => {
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  }
  db.close();
}

describe('snapshotEvery heuristic (pre-seeded)', () => {
  it('0 existing events -> snapshotEvery=20 (first snapshot at 20)', async () => {
    const dbName = makeDbName('heur0');
    const inst = await createInstance({ dbName, channelName: `chan-${dbName}` });
    const now = 1_700_100_000_000;
    for (let i = 1; i <= 20; i++) {
      await inst.append(
        makeEvent('score/added', { playerId: 'p1', delta: 1 }, { eventId: `e0-${i}`, ts: now + i }),
      );
    }
    inst.close();
    const heights = await listSnapshotHeights(dbName);
    expect(heights).toEqual([20]);
  });

  it('<=1000 existing (990) -> snapshotEvery=20 (first snapshot at 1000)', async () => {
    const dbName = makeDbName('heur1k');
    await seedEvents(dbName, 990);
    const inst = await createInstance({ dbName, channelName: `chan-${dbName}` });
    const now = 1_700_200_000_000;
    for (let i = 1; i <= 10; i++) {
      await inst.append(
        makeEvent('score/added', { playerId: 'p1', delta: 1 }, { eventId: `e1-${i}`, ts: now + i }),
      );
    }
    inst.close();
    const heights = await listSnapshotHeights(dbName);
    expect(heights).toEqual([1000]);
  });

  it('>1000 and <=5000 existing (2960) -> snapshotEvery=50 (first snapshot at 3000)', async () => {
    const dbName = makeDbName('heur5k');
    await seedEvents(dbName, 2960);
    const inst = await createInstance({ dbName, channelName: `chan-${dbName}` });
    const now = 1_700_300_000_000;
    for (let i = 1; i <= 40; i++) {
      await inst.append(
        makeEvent('score/added', { playerId: 'p1', delta: 1 }, { eventId: `e2-${i}`, ts: now + i }),
      );
    }
    inst.close();
    const heights = await listSnapshotHeights(dbName);
    expect(heights).toEqual([3000]);
  });

  it('>5000 and <=20000 existing (5001) -> snapshotEvery=100 (first snapshot at 5100)', async () => {
    const dbName = makeDbName('heur20k');
    await seedEvents(dbName, 5001);
    const inst = await createInstance({ dbName, channelName: `chan-${dbName}` });
    const now = 1_700_400_000_000;
    for (let i = 1; i <= 99; i++) {
      await inst.append(
        makeEvent('score/added', { playerId: 'p1', delta: 1 }, { eventId: `e3-${i}`, ts: now + i }),
      );
    }
    inst.close();
    const heights = await listSnapshotHeights(dbName);
    expect(heights).toEqual([5100]);
  }, 20000);
});
