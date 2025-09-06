import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createInstance, events, openDB, storeNames, type Instance } from '@/lib/state';

function dbName(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe('state instance (IndexedDB)', () => {
  it('rehydrates initial state and appends events; duplicate append is idempotent', async () => {
    const name = dbName('inst-basic');
    const inst = await createInstance({ dbName: name, useChannel: false, snapshotEvery: 1000 });
    expect(inst.getHeight()).toBe(0);
    expect(Object.keys(inst.getState().players)).toHaveLength(0);

    const seen: Array<{ h: number; players: string[] }> = [];
    const unsub = inst.subscribe((s, h) => {
      seen.push({ h, players: Object.keys(s.players) });
    });

    // Append a player with a fixed eventId
    const e1 = events.playerAdded({ id: 'p1', name: 'A' }, { eventId: 'e1', ts: 1 });
    const h1 = await inst.append(e1);
    expect(h1).toBe(inst.getHeight());
    expect(inst.getHeight()).toBeGreaterThan(0);
    expect(Object.keys(inst.getState().players)).toContain('p1');
    expect(seen.at(-1)?.h).toBe(inst.getHeight());

    // Append duplicate with same eventId — should be idempotent and not change height/state
    const hDup = await inst.append({ ...e1 });
    expect(hDup).toBe(inst.getHeight());
    expect(Object.keys(inst.getState().players)).toContain('p1');

    unsub();
    inst.close();
  });

  it('appendMany skips duplicates by eventId within the same batch', async () => {
    const name = dbName('inst-batch');
    const inst = await createInstance({ dbName: name, useChannel: false, snapshotEvery: 1000 });
    const a = events.playerAdded({ id: 'p2', name: 'B' }, { eventId: 'id-p2' });
    const aDup = events.playerAdded({ id: 'p2', name: 'B2' }, { eventId: 'id-p2' });
    const b = events.playerAdded({ id: 'p3', name: 'C' }, { eventId: 'id-p3' });
    const h = await inst.appendMany([a, aDup, b]);
    expect(h).toBe(inst.getHeight());
    const players = Object.keys(inst.getState().players);
    expect(players).toContain('p2');
    expect(players).toContain('p3');
    inst.close();
  });

  it('rehydrates from snapshot when current record is missing', async () => {
    const name = dbName('inst-snap');
    // Force snapshot every write
    const inst = await createInstance({ dbName: name, useChannel: false, snapshotEvery: 1 });
    await inst.append(events.playerAdded({ id: 'p1', name: 'A' }));
    await inst.append(events.playerAdded({ id: 'p2', name: 'B' }));
    await inst.append(events.playerAdded({ id: 'p3', name: 'C' }));
    const targetH = inst.getHeight();
    inst.close();

    // Delete current record to force snapshot fallback
    const db = await openDB(name);
    await new Promise<void>((res, rej) => {
      const t = db.transaction([storeNames.STATE], 'readwrite');
      const r = t.objectStore(storeNames.STATE).delete('current');
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error as any);
    });
    db.close();

    const inst2 = await createInstance({ dbName: name, useChannel: false, snapshotEvery: 1 });
    expect(inst2.getHeight()).toBe(targetH);
    expect(Object.keys(inst2.getState().players)).toEqual(['p1', 'p2', 'p3']);
    inst2.close();
  });

  it('test hooks: abort-after-add and generic failure affect one call', async () => {
    const name = dbName('inst-hooks');
    const inst = (await createInstance({ dbName: name, useChannel: false })) as Instance & {
      setTestAbortAfterAddOnce: () => void;
      setTestAppendFailure: (m: 'quota' | 'generic' | null) => void;
    };

    inst.setTestAbortAfterAddOnce();
    await expect(inst.append(events.playerAdded({ id: 'x', name: 'X' }))).rejects.toBeInstanceOf(
      Error,
    );
    // Next append should succeed
    await expect(inst.append(events.playerAdded({ id: 'x', name: 'X' }))).resolves.toBeGreaterThan(
      0,
    );

    inst.setTestAppendFailure('generic');
    await expect(inst.append(events.playerAdded({ id: 'y', name: 'Y' }))).rejects.toBeInstanceOf(
      Error,
    );
    // And then succeed subsequently
    await expect(inst.append(events.playerAdded({ id: 'y', name: 'Y' }))).resolves.toBeGreaterThan(
      0,
    );

    inst.close();
  });
});
