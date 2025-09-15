import { openDB, storeNames, tx } from './db';
import type { AppEvent, AppState } from './types';
import { INITIAL_STATE, reduce } from './types';
import { events } from './events';
import { uuid } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';

export type ExportBundle = {
  latestSeq: number;
  events: AppEvent[];
};

export type GameRecord = {
  id: string;
  title: string;
  createdAt: number;
  finishedAt: number;
  lastSeq: number;
  summary: {
    players: number;
    scores: Record<string, number>;
    playersById: Record<string, string>;
    winnerId: string | null;
    winnerName: string | null;
    winnerScore: number | null;
    sp?: {
      phase: 'setup' | 'bidding' | 'playing' | 'summary' | 'game-summary' | 'done';
      roundNo: number | null;
      dealerId: string | null;
      leaderId: string | null;
      order: string[];
      trump: 'clubs' | 'diamonds' | 'hearts' | 'spades' | null;
      trumpCard: { suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'; rank: number } | null;
      trickCounts: Record<string, number>;
      trumpBroken: boolean;
    };
  };
  bundle: ExportBundle;
};

function asError(e: unknown, fallbackMessage: string): Error {
  if (e instanceof Error) return e;
  const message =
    typeof e === 'string'
      ? e
      : e && typeof (e as { message?: unknown }).message === 'string'
        ? String((e as { message?: unknown }).message)
        : fallbackMessage;
  const err = new Error(message);
  try {
    (err as { cause?: unknown }).cause = e;
  } catch {}
  return err;
}

// Default database names
export const DEFAULT_DB_NAME = 'app-db';
export const GAMES_DB_NAME = 'app-games-db';

export async function exportBundle(dbName: string): Promise<ExportBundle> {
  const db = await openDB(dbName);
  const t = tx(db, 'readonly', [storeNames.EVENTS]);
  const store = t.objectStore(storeNames.EVENTS);
  const cursorReq = store.openCursor();
  const events: AppEvent[] = [];
  let lastSeq = 0;
  await new Promise<void>((res, rej) => {
    cursorReq.onsuccess = () => {
      const cur = cursorReq.result;
      if (!cur) return res();
      events.push(cur.value as AppEvent);
      lastSeq = Number(cur.primaryKey ?? cur.key ?? lastSeq);
      cur.continue();
    };
    cursorReq.onerror = () => rej(asError(cursorReq.error, 'Failed reading events during export'));
  });
  db.close();
  return { latestSeq: lastSeq, events };
}

export async function importBundle(dbName: string, bundle: ExportBundle): Promise<void> {
  // Recreate DB to ensure clean state
  await new Promise<void>((res, _rej) => {
    const del = indexedDB.deleteDatabase(dbName);
    del.onsuccess = () => res();
    del.onerror = () => {
      // If delete fails (e.g., DB absent), continue by resolving
      res();
    };
    del.onblocked = () => {
      // Best-effort: still resolve, tests run in isolated DB names
      res();
    };
  });

  const db = await openDB(dbName);
  const t = tx(db, 'readwrite', [storeNames.EVENTS]);
  const store = t.objectStore(storeNames.EVENTS);
  for (const e of bundle.events) {
    await new Promise<void>((res) => {
      const r = store.add(e);
      r.onsuccess = () => res();
      r.onerror = () => {
        // Ignore duplicates on import
        res();
      };
    });
  }
  await new Promise<void>((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(asError(t.error, 'Transaction error importing bundle'));
    t.onabort = () => rej(asError(t.error, 'Transaction aborted importing bundle'));
  });
  db.close();
}

// Replace DB contents without deleting the database to avoid blocked deletions.
export async function importBundleSoft(dbName: string, bundle: ExportBundle): Promise<void> {
  const db = await openDB(dbName);
  const t = tx(db, 'readwrite', [storeNames.EVENTS, storeNames.STATE, storeNames.SNAPSHOTS]);
  const eventsStore = t.objectStore(storeNames.EVENTS);
  const stateStore = t.objectStore(storeNames.STATE);
  const snapsStore = t.objectStore(storeNames.SNAPSHOTS);
  // Clear existing data
  await new Promise<void>((res, rej) => {
    const r = eventsStore.clear();
    r.onsuccess = () => res();
    r.onerror = () => rej(asError(r.error, 'Failed clearing events'));
  });
  await new Promise<void>((res, rej) => {
    const r = stateStore.clear();
    r.onsuccess = () => res();
    r.onerror = () => rej(asError(r.error, 'Failed clearing state'));
  });
  await new Promise<void>((res, rej) => {
    const r = snapsStore.clear();
    r.onsuccess = () => res();
    r.onerror = () => rej(asError(r.error, 'Failed clearing snapshots'));
  });
  // Add events
  for (const e of bundle.events) {
    await new Promise<void>((res) => {
      const r = eventsStore.add(e);
      r.onsuccess = () => res();
      r.onerror = () => res();
    });
  }
  // Persist current state directly for quick load
  const finalState = reduceBundle(bundle);
  const h = bundle.latestSeq ?? bundle.events.length;
  await new Promise<void>((res, rej) => {
    const r = stateStore.put({ id: 'current', height: h, state: finalState });
    r.onsuccess = () => res();
    r.onerror = () => rej(asError(r.error, 'Failed writing current state'));
  });
  await new Promise<void>((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(asError(t.error, 'Transaction error importing bundle (soft)'));
    t.onabort = () => rej(asError(t.error, 'Transaction aborted importing bundle (soft)'));
  });
  db.close();
}

export async function previewAt(dbName: string, h: number): Promise<AppState> {
  const db = await openDB(dbName);
  // nearest snapshot <= h
  let base: AppState = INITIAL_STATE;
  let baseH = 0;
  try {
    const st = tx(db, 'readonly', [storeNames.SNAPSHOTS]);
    const curReq = st
      .objectStore(storeNames.SNAPSHOTS)
      .openCursor(IDBKeyRange.upperBound(h), 'prev');
    const snap = await new Promise<{ height: number; state: AppState } | undefined>((res, rej) => {
      curReq.onsuccess = () => {
        const c = curReq.result;
        if (!c) return res(undefined);
        res(c.value as { height: number; state: AppState });
      };
      curReq.onerror = () => rej(asError(curReq.error, 'Failed reading snapshot for preview'));
    });
    if (snap && typeof snap.height === 'number' && snap.state) {
      base = snap.state;
      baseH = snap.height;
    }
  } catch {}
  const t = tx(db, 'readonly', [storeNames.EVENTS]);
  const req = t.objectStore(storeNames.EVENTS).openCursor(IDBKeyRange.lowerBound(baseH + 1));
  let s = base;
  await new Promise<void>((res, rej) => {
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return res();
      const seq = Number(cur.primaryKey ?? cur.key);
      if (seq <= h) {
        s = reduce(s, cur.value as AppEvent);
        cur.continue();
      } else {
        res();
      }
    };
    req.onerror = () => rej(asError(req.error, 'Failed iterating events for preview'));
  });
  db.close();
  return s;
}

// uuid is imported from lib/utils

function reduceBundle(bundle: ExportBundle): AppState {
  let s = INITIAL_STATE;
  for (const e of bundle.events) {
    s = reduce(s, e);
  }
  return s;
}

function summarizeState(s: AppState): GameRecord['summary'] {
  const scores = s.scores || {};
  const playersById = s.players || {};
  let winnerId: string | null = null;
  let winnerScore: number | null = null;
  for (const [pid, sc] of Object.entries(scores)) {
    if (winnerScore === null || sc > winnerScore) {
      winnerScore = sc;
      winnerId = pid;
    }
  }
  const spUnknown = (s as unknown as { sp?: unknown }).sp;
  const sp = (spUnknown && typeof spUnknown === 'object' ? spUnknown : {}) as Partial<
    AppState['sp']
  >;
  return {
    players: Object.keys(playersById).length,
    scores,
    playersById,
    winnerId,
    winnerName: winnerId ? (playersById[winnerId] ?? null) : null,
    winnerScore,
    sp: {
      phase: sp.phase ?? 'setup',
      roundNo: sp.roundNo ?? null,
      dealerId: sp.dealerId ?? null,
      leaderId: sp.leaderId ?? null,
      order: Array.isArray(sp.order) ? [...sp.order] : [],
      trump: sp.trump ?? null,
      trumpCard: sp.trumpCard ? { suit: sp.trumpCard.suit, rank: sp.trumpCard.rank } : null,
      trickCounts: { ...(sp.trickCounts ?? {}) },
      trumpBroken: !!sp.trumpBroken,
    },
  };
}

async function putGameRecord(db: IDBDatabase, rec: GameRecord): Promise<void> {
  const t = tx(db, 'readwrite', [storeNames.GAMES]);
  const r = t.objectStore(storeNames.GAMES).put(rec);
  await new Promise<void>((res, rej) => {
    r.onsuccess = () => res();
    r.onerror = () => rej(asError(r.error, 'Failed writing game record'));
    t.onabort = () => rej(asError(t.error, 'Transaction aborted writing game record'));
    t.onerror = () => rej(asError(t.error, 'Transaction error writing game record'));
  });
}

export async function listGames(gamesDbName: string = GAMES_DB_NAME): Promise<GameRecord[]> {
  const db = await openDB(gamesDbName);
  // Read all records via index if present; fallback to cursor
  const t = tx(db, 'readonly', [storeNames.GAMES]);
  const store = t.objectStore(storeNames.GAMES);
  const useIndex = store.indexNames.contains?.('createdAt') ?? false;
  const cursorReq = useIndex
    ? store.index('createdAt').openCursor(null, 'prev')
    : store.openCursor();
  const out: GameRecord[] = [];
  await new Promise<void>((res, rej) => {
    cursorReq.onsuccess = () => {
      const c = cursorReq.result;
      if (!c) return res();
      out.push(c.value as GameRecord);
      c.continue();
    };
    cursorReq.onerror = () => rej(asError(cursorReq.error, 'Failed listing games'));
  });
  db.close();
  // If no index sort, sort desc by createdAt
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

export async function getGame(
  gamesDbName: string = GAMES_DB_NAME,
  id: string,
): Promise<GameRecord | null> {
  const db = await openDB(gamesDbName);
  const t = tx(db, 'readonly', [storeNames.GAMES]);
  const req = t.objectStore(storeNames.GAMES).get(id);
  const rec = await new Promise<GameRecord | null>((res, rej) => {
    req.onsuccess = () => res((req.result as GameRecord | null) ?? null);
    req.onerror = () => rej(asError(req.error, 'Failed to get game record'));
  });
  db.close();
  return rec;
}

export async function deleteGame(gamesDbName: string = GAMES_DB_NAME, id: string): Promise<void> {
  const db = await openDB(gamesDbName);
  const t = tx(db, 'readwrite', [storeNames.GAMES]);
  const req = t.objectStore(storeNames.GAMES).delete(id);
  await new Promise<void>((res, rej) => {
    req.onsuccess = () => res();
    req.onerror = () => rej(asError(req.error, 'Failed to delete game record'));
  });
  db.close();
}

export async function archiveCurrentGameAndReset(
  dbName: string = DEFAULT_DB_NAME,
  opts?: { title?: string },
): Promise<GameRecord | null> {
  // Export current bundle
  const bundle = await exportBundle(dbName);
  if (!bundle.latestSeq || bundle.latestSeq <= 0) {
    // Nothing to archive; still reset DB to initial state to satisfy New Game semantics
    await importBundle(dbName, { latestSeq: 0, events: [] });
    // Trigger listeners via storage event/local broadcast
    try {
      localStorage.setItem(`app-events:lastSeq:${dbName}`, '0');
    } catch {}
    return null;
  }

  // Prepare archive record and seed events
  const id = uuid();
  const createdAt = Number(bundle.events[0]?.ts ?? Date.now());
  const finishedAt = Date.now();
  const title = (opts?.title && opts.title.trim()) || formatDateTime(finishedAt);
  const endState = reduceBundle(bundle);
  const summary = summarizeState(endState);
  const rec: GameRecord = {
    id,
    title,
    createdAt,
    finishedAt,
    lastSeq: bundle.latestSeq,
    summary,
    bundle,
  };
  // Prepare seed events for new session: include a session seed for reproducible deals, then roster.
  const baseSeedEvent: AppEvent = events.spSeedSet(
    { seed: Math.floor(finishedAt) },
    { ts: finishedAt },
  );
  const seedEvents: AppEvent[] = [
    baseSeedEvent,
    ...Object.entries(endState.players).map(([id, name], idx) =>
      events.playerAdded({ id, name }, { ts: finishedAt + idx + 1 }),
    ),
  ];

  // Error helpers with surface codes
  function fail(code: string, info?: unknown): never {
    const ex: Error & { code: string; info?: unknown } = Object.assign(new Error(code), {
      name: code,
      code,
      info,
    });
    throw ex;
  }

  // Step 1: write archive record
  const gamesDb = await openDB(GAMES_DB_NAME);
  try {
    await putGameRecord(gamesDb, rec);
  } catch (e) {
    try {
      gamesDb.close();
    } catch {}
    fail('archive.write_record_failed', { error: String(e) });
  }
  try {
    gamesDb.close();
  } catch {}

  // Step 2: reset current DB by seeding roster. If this fails, roll back archive record
  try {
    await importBundleSoft(dbName, { latestSeq: seedEvents.length, events: seedEvents });
  } catch (e) {
    // Attempt rollback: delete archive record
    try {
      const db = await openDB(GAMES_DB_NAME);
      const t = tx(db, 'readwrite', [storeNames.GAMES]);
      const del = t.objectStore(storeNames.GAMES).delete(id);
      await new Promise<void>((res, rej) => {
        del.onsuccess = () => res();
        del.onerror = () => rej(asError(del.error, 'Failed to rollback archived record'));
      });
      try {
        db.close();
      } catch {}
    } catch (delErr) {
      // Expose rollback failure details
      fail('archive.reset_failed_and_rollback_failed', {
        error: String(e),
        rollbackError: String(delErr),
      });
    }
    fail('archive.reset_failed', { error: String(e) });
  }

  // Step 3: notify listeners (best effort). These are not part of atomic storage writes
  try {
    localStorage.setItem(`app-events:lastSeq:${dbName}`, String(seedEvents.length));
    localStorage.setItem(`app-events:signal:${dbName}`, 'reset');
    try {
      // best-effort self-dispatch for same-tab listeners
      const EvCtor = StorageEvent as unknown as {
        new (type: string, eventInitDict?: StorageEventInit): StorageEvent;
      };
      const ev = new EvCtor('storage', {
        key: `app-events:signal:${dbName}`,
        newValue: 'reset',
        storageArea: localStorage,
      });
      dispatchEvent(ev);
    } catch {}
  } catch {}
  try {
    const bc = new BroadcastChannel('app-events');
    bc.postMessage({ type: 'reset' });
    bc.close();
  } catch {}
  return rec;
}

export async function restoreGame(dbName: string = DEFAULT_DB_NAME, id: string): Promise<void> {
  const rec = await getGame(GAMES_DB_NAME, id);
  if (!rec) return;
  await importBundleSoft(dbName, rec.bundle);
  try {
    localStorage.setItem(`app-events:lastSeq:${dbName}`, String(rec.lastSeq || 0));
    localStorage.setItem(`app-events:signal:${dbName}`, 'reset');
    try {
      // best-effort self-dispatch for same-tab listeners
      const EvCtor = StorageEvent as unknown as {
        new (type: string, eventInitDict?: StorageEventInit): StorageEvent;
      };
      const ev = new EvCtor('storage', {
        key: `app-events:signal:${dbName}`,
        newValue: 'reset',
        storageArea: localStorage,
      });
      dispatchEvent(ev);
    } catch {}
  } catch {}
  try {
    const bc = new BroadcastChannel('app-events');
    bc.postMessage({ type: 'reset' });
    bc.close();
  } catch {}
}
