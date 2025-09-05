import { describe, it, expect } from 'vitest';
import { createInstance } from '@/lib/state/instance';
import { makeEvent } from '@/lib/state/events';

function makeDbName(prefix = 'snapc-early') {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function delay(ms = 5) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

async function listSnapshotHeights(dbName: string): Promise<number[]> {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(dbName);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = db.transaction(['snapshots'], 'readonly');
  const curReq = tx.objectStore('snapshots').openCursor();
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

describe('compactSnapshots early return', () => {
  it('returns early when below compaction threshold', async () => {
    const dbName = makeDbName();
    const inst = await createInstance({
      dbName,
      channelName: `chan-${dbName}`,
      snapshotEvery: 10, // minCompactionHeight = 10 * (keepRecent(5) + 5) = 80
    });

    const now = 1_700_000_000_000;
    for (let i = 1; i <= 50; i++) {
      await inst.append(
        makeEvent('score/added', { playerId: 'p1', delta: 1 }, { eventId: `e${i}`, ts: now + i }),
      );
    }
    expect(inst.getHeight()).toBe(50);

    // Allow background compaction (scheduled via setTimeout) to run
    await delay(15);
    inst.close();

    const heights = await listSnapshotHeights(dbName);
    // Since height < 80, compaction should early-return and keep all snapshots
    expect(heights).toEqual([10, 20, 30, 40, 50]);
  });
});

