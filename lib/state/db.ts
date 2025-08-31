const DB_VERSION = 2
const EVENTS = 'events'
const STATE = 'state'
const SNAPSHOTS = 'snapshots'

export type Stores = typeof EVENTS | typeof STATE | typeof SNAPSHOTS

export async function openDB(name: string): Promise<IDBDatabase> {
  const req = indexedDB.open(name, DB_VERSION)
  req.onupgradeneeded = () => {
    const db = req.result
    if (!db.objectStoreNames.contains(EVENTS)) {
      const s = db.createObjectStore(EVENTS, { keyPath: 'seq', autoIncrement: true })
      s.createIndex('eventId', 'eventId', { unique: true })
    }
    if (!db.objectStoreNames.contains(STATE)) {
      db.createObjectStore(STATE, { keyPath: 'id' })
    }
    if (!db.objectStoreNames.contains(SNAPSHOTS)) {
      db.createObjectStore(SNAPSHOTS, { keyPath: 'height' })
    }
  }
  return await new Promise((res, rej) => {
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}

export function tx(db: IDBDatabase, mode: IDBTransactionMode, stores: Stores[]) {
  return db.transaction(stores, mode)
}

export const storeNames = { EVENTS, STATE, SNAPSHOTS }

