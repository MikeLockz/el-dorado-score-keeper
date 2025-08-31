import { openDB, storeNames, tx } from './db'
import { AppEvent, AppState, INITIAL_STATE, reduce } from './types'

export type Instance = {
  append: (event: AppEvent) => Promise<number>
  getState: () => AppState
  getHeight: () => number
  rehydrate: () => Promise<void>
  close: () => void
  subscribe: (cb: (s: AppState, h: number) => void) => () => void
}

type CurrentStateRecord = { id: 'current'; height: number; state: AppState }

export async function createInstance(opts?: { dbName?: string; channelName?: string; useChannel?: boolean }): Promise<Instance> {
  const dbName = opts?.dbName ?? 'app-db'
  const chanName = opts?.channelName ?? 'app-events'
  const useChannel = opts?.useChannel !== false
  const db = await openDB(dbName)
  const chan = useChannel ? (new BroadcastChannel(chanName) as BroadcastChannel) : null
  let memoryState: AppState = INITIAL_STATE
  let height = 0
  const listeners = new Set<(s: AppState, h: number) => void>()
  const notify = () => { for (const l of listeners) l(memoryState, height) }
  const SNAPSHOT_EVERY = 20

  function isPlainObject(v: any) { return v && typeof v === 'object' && !Array.isArray(v) }
  function isValidStateRecord(rec: any): rec is CurrentStateRecord {
    if (!rec || rec.id !== 'current' || typeof rec.height !== 'number') return false
    const s = rec.state
    if (!isPlainObject(s)) return false
    if (!isPlainObject(s.players) || !isPlainObject(s.scores)) return false
    for (const k of Object.keys(s.players)) if (typeof (s.players as any)[k] !== 'string') return false
    for (const k of Object.keys(s.scores)) if (typeof (s.scores as any)[k] !== 'number') return false
    return true
  }

  async function loadCurrent() {
    const t = tx(db, 'readonly', [storeNames.STATE])
    const req = t.objectStore(storeNames.STATE).get('current')
    const rec = await new Promise<CurrentStateRecord | undefined>((res, rej) => {
      req.onsuccess = () => res(req.result as any)
      req.onerror = () => rej(req.error)
    })
    if (isValidStateRecord(rec)) {
      memoryState = rec.state
      height = rec.height
    } else if (rec) {
      memoryState = INITIAL_STATE
      height = 0
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
        const ev = cur.value as AppEvent
        memoryState = reduce(memoryState, ev)
        height = Number(cur.primaryKey ?? cur.key)
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

  if (chan) {
    chan.addEventListener('message', async (ev: MessageEvent) => {
      if (!ev?.data || typeof ev.data.seq !== 'number') return
      await applyTail(height)
      await persistCurrent()
      notify()
    })
  } else if (typeof addEventListener === 'function') {
    addEventListener('storage', async (ev: any) => {
      if (!ev || ev.key !== `app-events:lastSeq:${dbName}`) return
      const seq = Number(ev.newValue)
      if (!Number.isFinite(seq) || seq <= height) return
      await applyTail(height)
      await persistCurrent()
      notify()
    })
  }

  async function rehydrate() {
    await loadCurrent()
    await applyTail(height)
    await persistCurrent()
    notify()
  }

  await rehydrate()

  let testFailMode: 'quota' | 'generic' | null = null

  async function append(event: AppEvent): Promise<number> {
    if (testFailMode) {
      const name = testFailMode === 'quota' ? 'QuotaExceededError' : 'TestAppendError'
      testFailMode = null
      const err = Object.assign(new Error(name), { name })
      throw err
    }
    // single transaction to add event and update current state
    const t = tx(db, 'readwrite', [storeNames.EVENTS, storeNames.STATE, storeNames.SNAPSHOTS])
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
    if (height % SNAPSHOT_EVERY === 0) {
      const snapPut = t.objectStore(storeNames.SNAPSHOTS).put({ height, state: memoryState })
      await new Promise<void>((res, rej) => {
        snapPut.onsuccess = () => res()
        snapPut.onerror = () => rej(snapPut.error)
      })
    }
    if (chan) {
      chan.postMessage({ type: 'append', seq })
    } else if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`app-events:lastSeq:${dbName}`, String(seq))
      } catch {}
    }
    notify()
    return seq!
  }

  function getState() { return memoryState }
  function getHeight() { return height }
  function close() { chan?.close(); db.close() }
  function subscribe(cb: (s: AppState, h: number) => void) { listeners.add(cb); return () => { listeners.delete(cb) } }
  function setTestAppendFailure(mode: 'quota' | 'generic' | null) { testFailMode = mode }

  return { append, getState, getHeight, rehydrate, close, subscribe, setTestAppendFailure } as Instance & { setTestAppendFailure: typeof setTestAppendFailure }
}
