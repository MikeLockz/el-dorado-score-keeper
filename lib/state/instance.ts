import { openDB, storeNames, tx } from './db'
import { AppEvent, AppState, INITIAL_STATE, reduce } from './types'

export type Instance = {
  append: (event: AppEvent) => Promise<number>
  getState: () => AppState
  getHeight: () => number
  rehydrate: () => Promise<void>
  close: () => void
}

type CurrentStateRecord = { id: 'current'; height: number; state: AppState }

export async function createInstance(opts?: { dbName?: string; channelName?: string }): Promise<Instance> {
  const db = await openDB(opts?.dbName ?? 'app-db')
  const chan = new BroadcastChannel(opts?.channelName ?? 'app-events')
  let memoryState: AppState = INITIAL_STATE
  let height = 0

  async function loadCurrent() {
    const t = tx(db, 'readonly', [storeNames.STATE])
    const req = t.objectStore(storeNames.STATE).get('current')
    const rec = await new Promise<CurrentStateRecord | undefined>((res, rej) => {
      req.onsuccess = () => res(req.result as any)
      req.onerror = () => rej(req.error)
    })
    if (rec) {
      memoryState = rec.state
      height = rec.height
    }
  }

  async function applyTail(fromExclusive: number) {
    const t = tx(db, 'readonly', [storeNames.EVENTS])
    const range = IDBKeyRange.lowerBound(fromExclusive + 1)
    const cursorReq = t.objectStore(storeNames.EVENTS).openCursor(range)
    await new Promise<void>((res, rej) => {
      cursorReq.onsuccess = () => {
        const cur = cursorReq.result
        if (!cur) return res()
        const ev = cur.value as AppEvent & { seq: number }
        memoryState = reduce(memoryState, ev)
        height = ev.seq
        cur.continue()
      }
      cursorReq.onerror = () => rej(cursorReq.error)
    })
  }

  async function persistCurrent() {
    const t = tx(db, 'readwrite', [storeNames.STATE])
    const req = t.objectStore(storeNames.STATE).put({ id: 'current', height, state: memoryState } as CurrentStateRecord)
    await new Promise<void>((res, rej) => {
      req.onsuccess = () => res()
      req.onerror = () => rej(req.error)
      t.onabort = () => rej(t.error)
      t.onerror = () => rej(t.error)
    })
  }

  chan.addEventListener('message', async (ev: MessageEvent) => {
    if (!ev?.data || typeof ev.data.seq !== 'number') return
    // fetch any events beyond our current height
    await applyTail(height)
    await persistCurrent()
  })

  async function rehydrate() {
    await loadCurrent()
    await applyTail(height)
    await persistCurrent()
  }

  await rehydrate()

  async function append(event: AppEvent): Promise<number> {
    // single transaction to add event and update current state
    const t = tx(db, 'readwrite', [storeNames.EVENTS, storeNames.STATE])
    const events = t.objectStore(storeNames.EVENTS)
    const addReq = events.add(event)
    let seq: number | undefined
    let duplicate = false
    seq = await new Promise<number>((res, rej) => {
      addReq.onsuccess = () => res(addReq.result as number)
      addReq.onerror = () => {
        // treat duplicate eventId as idempotent success
        const err: any = addReq.error
        if (err && (err.name === 'ConstraintError' || String(err).includes('Constraint'))) {
          duplicate = true
          // find existing seq by eventId index
          const idx = events.index('eventId')
          const getReq = idx.getKey((event as any).eventId)
          getReq.onsuccess = () => res((getReq.result as number) ?? height)
          getReq.onerror = () => rej(getReq.error)
        } else {
          rej(addReq.error)
        }
      }
    })
    // apply/persist: if duplicate, catch up by applying tail; otherwise reduce directly
    if (duplicate) {
      await applyTail(height)
    } else {
      memoryState = reduce(memoryState, event)
      height = seq
    }
    const putReq = t.objectStore(storeNames.STATE).put({ id: 'current', height, state: memoryState } as CurrentStateRecord)
    await new Promise<void>((res, rej) => {
      putReq.onsuccess = () => res()
      putReq.onerror = () => rej(putReq.error)
      t.onabort = () => rej(t.error)
      t.onerror = () => rej(t.error)
    })
    chan.postMessage({ type: 'append', seq })
    return seq!
  }

  function getState() { return memoryState }
  function getHeight() { return height }
  function close() { chan.close(); db.close() }

  return { append, getState, getHeight, rehydrate, close }
}

