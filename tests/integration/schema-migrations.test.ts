import { describe, it, expect, beforeEach } from 'vitest';
import { openDB, storeNames } from '@/lib/state/db';

function makeDbName(prefix = 'schema') {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

describe('IndexedDB schema migrations', () => {
  let dbName: string;
  beforeEach(() => {
    dbName = makeDbName();
  });

  it('upgrades v1 -> v2 by adding games store and index', async () => {
    // Create a v1 database: events/state/snapshots only
    const r1 = indexedDB.open(dbName, 1);
    r1.onupgradeneeded = () => {
      const db = r1.result;
      const events = db.createObjectStore('events', { keyPath: 'seq', autoIncrement: true });
      events.createIndex('eventId', 'eventId', { unique: true });
      db.createObjectStore('state', { keyPath: 'id' });
      db.createObjectStore('snapshots', { keyPath: 'height' });
      // seed one event to ensure data persists across upgrade
      const tx = r1.transaction!;
      const addReq = tx
        .objectStore('events')
        .add({ type: 'init', eventId: 'seed-1', ts: Date.now() });
      addReq.onerror = () => {};
    };
    await new Promise<void>((res, rej) => {
      r1.onsuccess = () => res();
      r1.onerror = () => rej(r1.error);
    });
    r1.result.close();

    // Now open with our helper (v2), triggering upgrade
    const db = await openDB(dbName);

    // Validate stores
    const names = db.objectStoreNames as DOMStringList;
    expect(names.contains(storeNames.EVENTS)).toBe(true);
    expect(names.contains(storeNames.STATE)).toBe(true);
    expect(names.contains(storeNames.SNAPSHOTS)).toBe(true);
    expect(names.contains(storeNames.GAMES)).toBe(true);

    // Validate indexes
    const t = db.transaction([storeNames.EVENTS, storeNames.GAMES], 'readonly');
    const eventsStore = t.objectStore(storeNames.EVENTS);
    const gamesStore = t.objectStore(storeNames.GAMES);
    expect((eventsStore.indexNames as DOMStringList).contains('eventId')).toBe(true);
    expect((gamesStore.indexNames as DOMStringList).contains('createdAt')).toBe(true);

    // Ensure the seeded event is still present
    const countReq = eventsStore.count();
    const count = await new Promise<number>((res, rej) => {
      countReq.onsuccess = () => res(countReq.result);
      countReq.onerror = () => rej(countReq.error);
    });
    expect(count).toBe(1);

    db.close();
  });

  it('opening an already v2 database is a no-op (no upgrade)', async () => {
    const db1 = await openDB(dbName);
    db1.close();
    // Re-open should not throw and should keep stores as-is
    const db2 = await openDB(dbName);
    const names = db2.objectStoreNames as DOMStringList;
    expect(names.contains(storeNames.GAMES)).toBe(true);
    db2.close();
  });
});
