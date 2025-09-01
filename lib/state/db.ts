export const storeNames = {
  EVENTS: 'events',
  STATE: 'state',
  SNAPSHOTS: 'snapshots',
  GAMES: 'games',
} as const

export type StoreName = typeof storeNames[keyof typeof storeNames]

export function tx(db: IDBDatabase, mode: IDBTransactionMode, stores: StoreName[]): IDBTransaction {
  return db.transaction(stores as string[], mode)
}

// IndexedDB schema versions
// v1: stores `events`, `state`, `snapshots`; `events.eventId` unique index
// v2: adds `games` store with `createdAt` index
export const SCHEMA_V1 = 1
export const SCHEMA_V2 = 2
export const SCHEMA_VERSION = SCHEMA_V2

export async function openDB(name: string): Promise<IDBDatabase> {
  // Upgrades are gated by `oldVersion` to avoid redundant checks and index re-creation.
  const req = indexedDB.open(name, SCHEMA_VERSION)
  req.onupgradeneeded = (ev) => {
    const db = req.result
    const oldVersion = (ev as IDBVersionChangeEvent).oldVersion || 0
    // Fresh DB or upgrade from < v1: create base stores and indexes
    if (oldVersion < SCHEMA_V1) {
      const events = db.createObjectStore(storeNames.EVENTS, { keyPath: 'seq', autoIncrement: true })
      events.createIndex('eventId', 'eventId', { unique: true })
      db.createObjectStore(storeNames.STATE, { keyPath: 'id' })
      db.createObjectStore(storeNames.SNAPSHOTS, { keyPath: 'height' })
    }
    // v1 -> v2: add archived games store
    if (oldVersion < SCHEMA_V2) {
      const games = db.createObjectStore(storeNames.GAMES, { keyPath: 'id' })
      games.createIndex('createdAt', 'createdAt', { unique: false })
    }
  }
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}
