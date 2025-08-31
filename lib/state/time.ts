import { openDB, storeNames, tx } from './db'
import { AppEvent, AppState, INITIAL_STATE, reduce } from './types'

export async function stateAtHeight(dbName: string, height: number): Promise<AppState> {
  const db = await openDB(dbName)
  let state: AppState = INITIAL_STATE

  // Start from the nearest snapshot at or below height, if any
  const snapTx = tx(db, 'readonly', [storeNames.SNAPSHOTS])
  const snapReq = snapTx.objectStore(storeNames.SNAPSHOTS).openKeyCursor()
  let startFrom = 0
  await new Promise<void>((res) => {
    snapReq.onsuccess = () => {
      const cur = snapReq.result
      if (!cur) return res()
      const h = Number(cur.primaryKey ?? cur.key)
      if (h <= height) {
        startFrom = h
        cur.continue()
      } else {
        res()
      }
    }
  })
  if (startFrom > 0) {
    const getSnap = tx(db, 'readonly', [storeNames.SNAPSHOTS]).objectStore(storeNames.SNAPSHOTS).get(startFrom)
    const rec = await new Promise<any>((res, rej) => {
      getSnap.onsuccess = () => res(getSnap.result)
      getSnap.onerror = () => rej(getSnap.error)
    })
    if (rec?.state) state = rec.state as AppState
  }

  const t = tx(db, 'readonly', [storeNames.EVENTS])
  const range = IDBKeyRange.lowerBound(startFrom + 1)
  const cursorReq = t.objectStore(storeNames.EVENTS).openCursor(range)
  await new Promise<void>((res, rej) => {
    cursorReq.onsuccess = () => {
      const cur = cursorReq.result
      if (!cur) return res()
      const seq = Number(cur.primaryKey ?? cur.key)
      if (seq > height) return res()
      const ev = cur.value as AppEvent
      state = reduce(state, ev)
      cur.continue()
    }
    cursorReq.onerror = () => rej(cursorReq.error)
  })
  db.close()
  return state
}
