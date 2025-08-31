import { openDB, storeNames, tx } from './db'
import type { AppEvent, AppState } from './types'
import { INITIAL_STATE, reduce } from './types'

export type ExportBundle = {
  latestSeq: number
  events: (AppEvent & { seq: number })[]
}

export async function exportBundle(dbName: string): Promise<ExportBundle> {
  const db = await openDB(dbName)
  const t = tx(db, 'readonly', [storeNames.EVENTS])
  const cursorReq = t.objectStore(storeNames.EVENTS).openCursor()
  const events: (AppEvent & { seq: number })[] = []
  let latest = 0
  await new Promise<void>((res, rej) => {
    cursorReq.onsuccess = () => {
      const cur = cursorReq.result
      if (!cur) return res()
      const val = cur.value as AppEvent
      const seq = Number(cur.primaryKey ?? cur.key)
      events.push(Object.assign({ seq }, val))
      latest = seq
      cur.continue()
    }
    cursorReq.onerror = () => rej(cursorReq.error)
  })
  db.close()
  return { latestSeq: latest, events }
}

export async function importBundle(dbName: string, bundle: ExportBundle): Promise<void> {
  const db = await openDB(dbName)
  const t = tx(db, 'readwrite', [storeNames.EVENTS, storeNames.STATE])
  const eventsStore = t.objectStore(storeNames.EVENTS)
  const stateStore = t.objectStore(storeNames.STATE)

  // Clear stores
  await new Promise<void>((res, rej) => {
    const r1 = eventsStore.clear()
    r1.onerror = () => rej(r1.error)
    r1.onsuccess = () => res()
  })
  await new Promise<void>((res, rej) => {
    const r2 = stateStore.clear()
    r2.onerror = () => rej(r2.error)
    r2.onsuccess = () => res()
  })

  // Insert events in order; letting seq auto-increment
  for (const e of bundle.events) {
    await new Promise<void>((res, rej) => {
      const r = eventsStore.add({ eventId: e.eventId, type: e.type, payload: e.payload, ts: e.ts })
      r.onsuccess = () => res()
      r.onerror = () => rej(r.error)
    })
  }

  // Recompute state
  let state: AppState = INITIAL_STATE
  for (const e of bundle.events) state = reduce(state, e)
  const height = bundle.events.length
  await new Promise<void>((res, rej) => {
    const r = stateStore.put({ id: 'current', height, state })
    r.onsuccess = () => res()
    r.onerror = () => rej(r.error)
  })

  await new Promise<void>((res, rej) => {
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
    t.onabort = () => rej(t.error)
  })
  db.close()
}

