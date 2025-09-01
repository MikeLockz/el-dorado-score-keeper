import { openDB, storeNames, tx } from './db'
import type { AppEvent, AppState } from './types'
import { INITIAL_STATE, reduce } from './types'
import { events } from './events'
import { uuid } from '@/lib/utils'
import { formatDateTime } from '@/lib/format'

export type ExportBundle = {
  latestSeq: number
  events: AppEvent[]
}

export type GameRecord = {
  id: string
  title: string
  createdAt: number
  finishedAt: number
  lastSeq: number
  summary: {
    players: number
    scores: Record<string, number>
    playersById: Record<string, string>
    winnerId: string | null
    winnerName: string | null
    winnerScore: number | null
  }
  bundle: ExportBundle
}

// Default database names
export const DEFAULT_DB_NAME = 'app-db'
export const GAMES_DB_NAME = 'app-games-db'

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

// Replace DB contents without deleting the database to avoid blocked deletions.
export async function importBundleSoft(dbName: string, bundle: ExportBundle): Promise<void> {
  const db = await openDB(dbName)
  const t = tx(db, 'readwrite', [storeNames.EVENTS, storeNames.STATE, storeNames.SNAPSHOTS])
  const eventsStore = t.objectStore(storeNames.EVENTS)
  const stateStore = t.objectStore(storeNames.STATE)
  const snapsStore = t.objectStore(storeNames.SNAPSHOTS)
  // Clear existing data
  await new Promise<void>((res, rej) => { const r = eventsStore.clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error) })
  await new Promise<void>((res, rej) => { const r = stateStore.clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error) })
  await new Promise<void>((res, rej) => { const r = snapsStore.clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error) })
  // Add events
  for (const e of bundle.events) {
    await new Promise<void>((res) => { const r = eventsStore.add(e as any); r.onsuccess = () => res(); r.onerror = () => res() })
  }
  // Persist current state directly for quick load
  const finalState = reduceBundle(bundle)
  const h = bundle.latestSeq ?? bundle.events.length
  await new Promise<void>((res, rej) => {
    const r = stateStore.put({ id: 'current', height: h, state: finalState } as any)
    r.onsuccess = () => res()
    r.onerror = () => rej(r.error)
  })
  await new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error) })
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

// uuid is imported from lib/utils

function reduceBundle(bundle: ExportBundle): AppState {
  let s = INITIAL_STATE
  for (const e of bundle.events) {
    s = reduce(s, e)
  }
  return s
}

function summarizeState(s: AppState): GameRecord['summary'] {
  const scores = s.scores || {}
  const playersById = s.players || {}
  let winnerId: string | null = null
  let winnerScore: number | null = null
  for (const [pid, sc] of Object.entries(scores)) {
    if (winnerScore === null || sc > winnerScore) {
      winnerScore = sc
      winnerId = pid
    }
  }
  return {
    players: Object.keys(playersById).length,
    scores,
    playersById,
    winnerId,
    winnerName: winnerId ? playersById[winnerId] ?? null : null,
    winnerScore,
  }
}

async function putGameRecord(db: IDBDatabase, rec: GameRecord): Promise<void> {
  const t = tx(db, 'readwrite', ['games'])
  const r = t.objectStore('games').put(rec as any)
  await new Promise<void>((res, rej) => {
    r.onsuccess = () => res()
    r.onerror = () => rej(r.error)
    t.onabort = () => rej(t.error)
    t.onerror = () => rej(t.error)
  })
}

export async function listGames(gamesDbName: string = GAMES_DB_NAME): Promise<GameRecord[]> {
  const db = await openDB(gamesDbName)
  // Read all records via index if present; fallback to cursor
  const t = tx(db, 'readonly', ['games'])
  const store = t.objectStore('games')
  const useIndex = (store.indexNames as any).contains?.('createdAt')
  const cursorReq = useIndex
    ? store.index('createdAt').openCursor(null, 'prev')
    : store.openCursor()
  const out: GameRecord[] = []
  await new Promise<void>((res, rej) => {
    cursorReq.onsuccess = () => {
      const c = cursorReq.result
      if (!c) return res()
      out.push(c.value as any)
      c.continue()
    }
    cursorReq.onerror = () => rej(cursorReq.error)
  })
  db.close()
  // If no index sort, sort desc by createdAt
  out.sort((a, b) => b.createdAt - a.createdAt)
  return out
}

export async function getGame(gamesDbName: string = GAMES_DB_NAME, id: string): Promise<GameRecord | null> {
  const db = await openDB(gamesDbName)
  const t = tx(db, 'readonly', ['games'])
  const req = t.objectStore('games').get(id)
  const rec = await new Promise<GameRecord | null>((res, rej) => {
    req.onsuccess = () => res((req.result as any) ?? null)
    req.onerror = () => rej(req.error)
  })
  db.close()
  return rec
}

export async function deleteGame(gamesDbName: string = GAMES_DB_NAME, id: string): Promise<void> {
  const db = await openDB(gamesDbName)
  const t = tx(db, 'readwrite', ['games'])
  const req = t.objectStore('games').delete(id)
  await new Promise<void>((res, rej) => {
    req.onsuccess = () => res()
    req.onerror = () => rej(req.error)
  })
  db.close()
}

export async function archiveCurrentGameAndReset(dbName: string = DEFAULT_DB_NAME, opts?: { title?: string }): Promise<GameRecord | null> {
  // Export current bundle
  const bundle = await exportBundle(dbName)
  if (!bundle.latestSeq || bundle.latestSeq <= 0) {
    // Nothing to archive; still reset DB to initial state to satisfy New Game semantics
    await importBundle(dbName, { latestSeq: 0, events: [] })
    // Trigger listeners via storage event/local broadcast
    try { localStorage.setItem(`app-events:lastSeq:${dbName}`, '0') } catch {}
    return null
  }
  const id = uuid()
  const createdAt = Number(bundle.events[0]?.ts ?? Date.now())
  const finishedAt = Date.now()
  const title = (opts?.title && opts.title.trim()) || formatDateTime(finishedAt)
  const endState = reduceBundle(bundle)
  const summary = summarizeState(endState)

  const rec: GameRecord = { id, title, createdAt, finishedAt, lastSeq: bundle.latestSeq, summary, bundle }
  const gamesDb = await openDB(GAMES_DB_NAME)
  await putGameRecord(gamesDb, rec)
  gamesDb.close()

  // Reset current DB but preserve player roster by seeding player/added events
  const seedEvents: AppEvent[] = Object.entries(endState.players).map(([id, name], idx) => (
    events.playerAdded({ id, name }, { ts: finishedAt + idx + 1 })
  ))
  await importBundleSoft(dbName, { latestSeq: seedEvents.length, events: seedEvents })
  try {
    localStorage.setItem(`app-events:lastSeq:${dbName}`, String(seedEvents.length))
    localStorage.setItem(`app-events:signal:${dbName}`, 'reset')
    try {
      // best-effort self-dispatch for same-tab listeners
      // @ts-ignore
      const ev = new StorageEvent('storage', { key: `app-events:signal:${dbName}`, newValue: 'reset', storageArea: localStorage })
      dispatchEvent(ev)
    } catch {}
  } catch {}
  try {
    const bc = new BroadcastChannel('app-events')
    bc.postMessage({ type: 'reset' })
    bc.close()
  } catch {}
  return rec
}

export async function restoreGame(dbName: string = DEFAULT_DB_NAME, id: string): Promise<void> {
  const rec = await getGame(GAMES_DB_NAME, id)
  if (!rec) return
  await importBundleSoft(dbName, rec.bundle)
  try {
    localStorage.setItem(`app-events:lastSeq:${dbName}`, String(rec.lastSeq || 0))
    localStorage.setItem(`app-events:signal:${dbName}`, 'reset')
    try {
      // best-effort self-dispatch for same-tab listeners
      // @ts-ignore
      const ev = new StorageEvent('storage', { key: `app-events:signal:${dbName}`, newValue: 'reset', storageArea: localStorage })
      dispatchEvent(ev)
    } catch {}
  } catch {}
  try {
    const bc = new BroadcastChannel('app-events')
    bc.postMessage({ type: 'reset' })
    bc.close()
  } catch {}
}
