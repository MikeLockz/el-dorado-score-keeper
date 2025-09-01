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

export async function createInstance(opts?: { dbName?: string; channelName?: string; useChannel?: boolean; onWarn?: (code: string, info?: any) => void }): Promise<Instance> {
  const dbName = opts?.dbName ?? 'app-db'
  const chanName = opts?.channelName ?? 'app-events'
  const useChannel = opts?.useChannel !== false
  const onWarn = opts?.onWarn
  const db = await openDB(dbName)
  const chan = useChannel ? (new BroadcastChannel(chanName) as BroadcastChannel) : null
  let memoryState: AppState = INITIAL_STATE
  let height = 0
  const listeners = new Set<(s: AppState, h: number) => void>()
  const notify = () => { for (const l of listeners) l(memoryState, height) }
  const SNAPSHOT_EVERY = 20
  // serialize catch-up operations to avoid double-apply under races
  let applyChain: Promise<void> = Promise.resolve()
  const enqueueCatchUp = (fn: () => Promise<void>) => {
    const next = applyChain.then(fn, fn)
    // keep chain from rejecting
    applyChain = next.catch(() => {})
    return next
  }

  function isPlainObject(v: any) { return v && typeof v === 'object' && !Array.isArray(v) }
  function warn(code: string, info?: any) { try { onWarn?.(code, info) } catch {} }
  function isValidStateRecord(rec: any): rec is CurrentStateRecord {
    if (!rec || rec.id !== 'current' || typeof rec.height !== 'number') return false
    const s = rec.state
    if (!isPlainObject(s)) return false
    if (!isPlainObject(s.players) || !isPlainObject(s.scores)) return false
    for (const k of Object.keys(s.players)) if (typeof (s.players as any)[k] !== 'string') return false
    for (const k of Object.keys(s.scores)) if (typeof (s.scores as any)[k] !== 'number') return false
    return true
  }
  function isValidEvent(e: any): e is AppEvent {
    return e && typeof e.type === 'string' && typeof e.eventId === 'string' && typeof e.ts === 'number'
  }

  async function loadCurrent() {
    // Try fast path: current record
    const t1 = tx(db, 'readonly', [storeNames.STATE])
    const req = t1.objectStore(storeNames.STATE).get('current')
    const rec = await new Promise<CurrentStateRecord | undefined>((res, rej) => {
      req.onsuccess = () => res(req.result as any)
      req.onerror = () => rej(req.error)
    })
    if (isValidStateRecord(rec)) {
      memoryState = rec.state
      height = rec.height
      return
    }
    if (rec) {
      warn('state.invalid_current')
    }
    // Fallback: use the latest snapshot if present
    const t2 = tx(db, 'readonly', [storeNames.SNAPSHOTS])
    try {
      const curReq = t2.objectStore(storeNames.SNAPSHOTS).openCursor(null, 'prev')
      const snap = await new Promise<{ height: number; state: AppState } | undefined>((res, rej) => {
        curReq.onsuccess = () => {
          const c = curReq.result
          if (!c) return res(undefined)
          res(c.value as any)
        }
        curReq.onerror = () => rej(curReq.error)
      })
      if (snap && typeof snap.height === 'number' && snap.state) {
        memoryState = snap.state
        height = snap.height
        return
      }
    } catch {
      // ignore snapshot failures; continue with initial
    }
    memoryState = INITIAL_STATE
    height = 0
  }

  async function applyTail(fromExclusive: number) {
    const t = tx(db, 'readonly', [storeNames.EVENTS])
    const range = IDBKeyRange.lowerBound(fromExclusive + 1)
    const cursorReq = t.objectStore(storeNames.EVENTS).openCursor(range)
    await new Promise<void>((res, rej) => {
      cursorReq.onsuccess = () => {
        const cur = cursorReq.result
        if (!cur) return res()
        const ev = cur.value as any
        if (isValidEvent(ev)) {
          memoryState = reduce(memoryState, ev)
        } else {
          warn('rehydrate.malformed_event')
        }
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
      const seq = Number((ev as any)?.data?.seq)
      if (!Number.isFinite(seq)) return
      await enqueueCatchUp(async () => {
        await applyTail(height)
        await persistCurrent()
        notify()
      })
    })
  } else if (typeof addEventListener === 'function') {
    addEventListener('storage', async (ev: any) => {
      if (!ev || ev.key !== `app-events:lastSeq:${dbName}`) return
      const seq = Number(ev.newValue)
      if (!Number.isFinite(seq)) return
      await enqueueCatchUp(async () => {
        await applyTail(height)
        await persistCurrent()
        notify()
      })
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
  let testAbortAfterAdd = false

  async function append(event: AppEvent): Promise<number> {
    if (testFailMode) {
      const name = testFailMode === 'quota' ? 'QuotaExceededError' : 'TestAppendError'
      testFailMode = null
      const err = Object.assign(new Error(name), { name })
      throw err
    }
    // Special test hook: add and then abort single transaction to ensure atomic rollback
    if (testAbortAfterAdd) {
      testAbortAfterAdd = false
      const t = tx(db, 'readwrite', [storeNames.EVENTS, storeNames.STATE])
      const addReq = t.objectStore(storeNames.EVENTS).add(event)
      await new Promise<void>((res, rej) => {
        addReq.onsuccess = () => res()
        addReq.onerror = () => rej(addReq.error)
      })
      try { t.abort() } catch {}
      const err = Object.assign(new Error('AbortedAfterAdd'), { name: 'AbortedAfterAdd' })
      throw err
    }
    // Phase 1: attempt to add the event in its own transaction
    let seq: number | undefined
    let duplicate = false
    try {
      const tAdd = tx(db, 'readwrite', [storeNames.EVENTS])
      const addReq = tAdd.objectStore(storeNames.EVENTS).add(event)
      seq = await new Promise<number>((res, rej) => {
        addReq.onsuccess = () => res(addReq.result as number)
        addReq.onerror = () => rej(addReq.error)
        tAdd.onabort = () => rej(tAdd.error)
        tAdd.onerror = () => rej(tAdd.error)
      })
    } catch (err: any) {
      // Treat duplicate eventId as idempotent success; look up existing seq
      if (err && (err.name === 'ConstraintError' || String(err).includes('Constraint'))) {
        duplicate = true
        const tFind = tx(db, 'readonly', [storeNames.EVENTS])
        const idx = tFind.objectStore(storeNames.EVENTS).index('eventId')
        const getReq = idx.getKey((event as any).eventId)
        seq = await new Promise<number>((res, rej) => {
          getReq.onsuccess = () => res((getReq.result as number) ?? height)
          getReq.onerror = () => rej(getReq.error)
        })
      } else {
        throw err
      }
    }
    // Optional test hook: abort after add but before state put
    if (testAbortAfterAdd) {
      testAbortAfterAdd = false
      const err = Object.assign(new Error('AbortedAfterAdd'), { name: 'AbortedAfterAdd' })
      throw err
    }
    // apply/persist: always catch up by applying tail from current height
    // This ensures we process any missing earlier events before (and including) this one
    await enqueueCatchUp(async () => {
      await applyTail(height)
      // Phase 2: persist current state and optional snapshot in a separate transaction
      const tPersist = tx(db, 'readwrite', [storeNames.STATE, storeNames.SNAPSHOTS])
      const putReq = tPersist.objectStore(storeNames.STATE).put({ id: 'current', height, state: memoryState } as CurrentStateRecord)
      await new Promise<void>((res, rej) => {
        putReq.onsuccess = () => res()
        putReq.onerror = () => rej(putReq.error)
        tPersist.onabort = () => rej(tPersist.error)
        tPersist.onerror = () => rej(tPersist.error)
      })
      if (height % SNAPSHOT_EVERY === 0) {
        const snapPut = tPersist.objectStore(storeNames.SNAPSHOTS).put({ height, state: memoryState })
        await new Promise<void>((res, rej) => {
          snapPut.onsuccess = () => res()
          snapPut.onerror = () => rej(snapPut.error)
        })
      }
    })
    if (chan) {
      chan.postMessage({ type: 'append', seq })
    } else if (typeof localStorage !== 'undefined') {
      try {
        const key = `app-events:lastSeq:${dbName}`
        const val = String(seq)
        localStorage.setItem(key, val)
        // In some environments, 'storage' may not fire across contexts. Best-effort dispatch.
        try {
          // @ts-ignore - StorageEvent may not be fully typed in Node
          const ev = new StorageEvent('storage', { key, newValue: val, storageArea: localStorage })
          dispatchEvent(ev)
        } catch {}
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
  function setTestAbortAfterAddOnce() { testAbortAfterAdd = true }

  return { append, getState, getHeight, rehydrate, close, subscribe, setTestAppendFailure, setTestAbortAfterAddOnce } as Instance & { setTestAppendFailure: typeof setTestAppendFailure; setTestAbortAfterAddOnce: typeof setTestAbortAfterAddOnce }
}
