import { openDB, storeNames, tx } from './db'
import type { AppEvent, AppState } from './types'
import { INITIAL_STATE, reduce } from './types'

export type ExportBundle = {
  latestSeq: number
  events: AppEvent[]
}

export async function exportBundle(dbName: string): Promise<ExportBundle> {
  const db = await openDB(dbName)
  const t = tx(db, 'readonly', [storeNames.EVENTS])
  const store = t.objectStore(storeNames.EVENTS)
  const cursorReq = store.openCursor()
  const events: AppEvent[] = []
  let lastSeq = 0
  await new Promise<void>((res, rej) => {
    cursorReq.onsuccess = () => {
      const cur = cursorReq.result
      if (!cur) return res()
      events.push(cur.value as AppEvent)
      lastSeq = Number(cur.primaryKey ?? cur.key ?? lastSeq)
      cur.continue()
    }
    cursorReq.onerror = () => rej(cursorReq.error)
  })
  db.close()
  return { latestSeq: lastSeq, events }
}

export async function importBundle(dbName: string, bundle: ExportBundle): Promise<void> {
  // Recreate DB to ensure clean state
  await new Promise<void>((res, rej) => {
    const del = indexedDB.deleteDatabase(dbName)
    del.onsuccess = () => res()
    del.onerror = () => {
      // If delete fails (e.g., DB absent), continue by resolving
      res()
    }
    del.onblocked = () => {
      // Best-effort: still resolve, tests run in isolated DB names
      res()
    }
  })

  const db = await openDB(dbName)
  const t = tx(db, 'readwrite', [storeNames.EVENTS])
  const store = t.objectStore(storeNames.EVENTS)
  for (const e of bundle.events) {
    await new Promise<void>((res) => {
      const r = store.add(e as any)
      r.onsuccess = () => res()
      r.onerror = () => {
        // Ignore duplicates on import
        res()
      }
    })
  }
  await new Promise<void>((res, rej) => {
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
    t.onabort = () => rej(t.error)
  })
  db.close()
}

export async function previewAt(dbName: string, h: number): Promise<AppState> {
  const db = await openDB(dbName)
  // nearest snapshot <= h
  let base: AppState = INITIAL_STATE
  let baseH = 0
  try {
    const st = tx(db, 'readonly', [storeNames.SNAPSHOTS])
    const curReq = st.objectStore(storeNames.SNAPSHOTS).openCursor(IDBKeyRange.upperBound(h), 'prev')
    const snap = await new Promise<{ height: number; state: AppState } | undefined>((res, rej) => {
      curReq.onsuccess = () => {
        const c = curReq.result
        if (!c) return res(undefined)
        res(c.value as any)
      }
      curReq.onerror = () => rej(curReq.error)
    })
    if (snap && typeof snap.height === 'number' && snap.state) {
      base = snap.state
      baseH = snap.height
    }
  } catch {}
  const t = tx(db, 'readonly', [storeNames.EVENTS])
  const req = t.objectStore(storeNames.EVENTS).openCursor(IDBKeyRange.lowerBound(baseH + 1))
  let s = base
  await new Promise<void>((res, rej) => {
    req.onsuccess = () => {
      const cur = req.result
      if (!cur) return res()
      const seq = Number(cur.primaryKey ?? cur.key)
      if (seq <= h) {
        s = reduce(s, cur.value as AppEvent)
        cur.continue()
      } else {
        res()
      }
    }
    req.onerror = () => rej(req.error)
  })
  db.close()
  return s
}
