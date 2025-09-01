export const storeNames = {
  EVENTS: 'events',
  STATE: 'state',
  SNAPSHOTS: 'snapshots',
} as const

export type StoreName = typeof storeNames[keyof typeof storeNames]

export function tx(db: IDBDatabase, mode: IDBTransactionMode, stores: StoreName[]): IDBTransaction {
  return db.transaction(stores as string[], mode)
}

export async function openDB(name: string): Promise<IDBDatabase> {
  // Schema version 2 (adds `games` store). Upgrades from v1 -> v2 create missing stores.
  const req = indexedDB.open(name, 2)
  req.onupgradeneeded = () => {
    const db = req.result
    const have = new Set<string>(Array.from(db.objectStoreNames as any))
    if (!have.has(storeNames.EVENTS)) {
      const events = db.createObjectStore(storeNames.EVENTS, { keyPath: 'seq', autoIncrement: true })
      events.createIndex('eventId', 'eventId', { unique: true })
    } else {
      // ensure index exists (in case of older DBs)
      const store = req.transaction!.objectStore(storeNames.EVENTS)
      if (!(store.indexNames as any).contains?.('eventId') && !(store.indexNames as any).contains?.('eventId')) {
        try { store.createIndex('eventId', 'eventId', { unique: true }) } catch {}
      }
    }
    if (!have.has(storeNames.STATE)) {
      db.createObjectStore(storeNames.STATE, { keyPath: 'id' })
    }
    if (!have.has(storeNames.SNAPSHOTS)) {
      db.createObjectStore(storeNames.SNAPSHOTS, { keyPath: 'height' })
    }
    // archived games store
    if (!have.has('games')) {
      const games = db.createObjectStore('games', { keyPath: 'id' })
      try { games.createIndex('createdAt', 'createdAt', { unique: false }) } catch {}
    }
  }
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}
