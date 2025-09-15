import { openDB, storeNames, tx } from './db';
import { AppEvent, AppState, INITIAL_STATE, reduce, type UUID } from './types';
import { validateEventStrict } from './validation';
import { uuid } from '@/lib/utils';

export type Instance = {
  append: (event: AppEvent) => Promise<number>;
  appendMany: (events: AppEvent[]) => Promise<number>;
  getState: () => AppState;
  getHeight: () => number;
  rehydrate: () => Promise<void>;
  close: () => void;
  subscribe: (cb: (s: AppState, h: number) => void) => () => void;
};

type CurrentStateRecord = { id: 'current'; height: number; state: AppState };

export async function createInstance(opts?: {
  dbName?: string;
  channelName?: string;
  useChannel?: boolean;
  onWarn?: (code: string, info?: unknown) => void;
  snapshotEvery?: number;
  keepRecentSnapshots?: number;
  anchorFactor?: number;
}): Promise<Instance> {
  const dbName = opts?.dbName ?? 'app-db';
  const chanName = opts?.channelName ?? 'app-events';
  const useChannel = opts?.useChannel !== false;
  const onWarn = opts?.onWarn;
  let db = await openDB(dbName);
  async function replaceDB() {
    try {
      db.close();
    } catch {}
    db = await openDB(dbName);
  }
  const chan = useChannel ? new BroadcastChannel(chanName) : null;
  const DEV = typeof process !== 'undefined' ? process.env?.NODE_ENV !== 'production' : false;
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
  function devLog(event: string, info?: unknown) {
    if (!DEV) return;
    try {
      console.debug('[rehydrate]', event, info ?? '');
    } catch {}
  }
  let memoryState: AppState = INITIAL_STATE;
  let height = 0;
  let isClosed = false;
  const listeners = new Set<(s: AppState, h: number) => void>();
  const notify = () => {
    for (const l of listeners) l(memoryState, height);
  };
  // Snapshot tuning defaults; may be adjusted after inspecting event volume
  let snapshotEvery = 20;
  const keepRecentSnapshots = Math.max(0, Math.floor(opts?.keepRecentSnapshots ?? 5));
  const anchorFactor = Math.max(1, Math.floor(opts?.anchorFactor ?? 5));
  const anchorEvery = () => Math.max(snapshotEvery, snapshotEvery * anchorFactor);
  // serialize catch-up operations to avoid double-apply under races
  let applyChain: Promise<void> = Promise.resolve();
  const enqueueCatchUp = (fn: () => Promise<void>) => {
    if (isClosed) return Promise.resolve();
    const next = applyChain.then(fn, fn);
    // keep chain from rejecting
    applyChain = next.catch(() => {});
    return next;
  };

  function chooseSnapshotEvery(totalEvents: number): number {
    // Simple heuristic: prefer tighter snapshots at low volumes for speed,
    // relax at higher volumes to limit snapshot count.
    if (!Number.isFinite(totalEvents) || totalEvents <= 0) return 20;
    if (totalEvents <= 1_000) return 20;
    if (totalEvents <= 5_000) return 50;
    if (totalEvents <= 20_000) return 100;
    return 200;
  }

  async function initSnapshotStrategy() {
    if (typeof opts?.snapshotEvery === 'number' && opts.snapshotEvery > 0) {
      snapshotEvery = Math.floor(opts.snapshotEvery);
      return;
    }
    try {
      const t = tx(db, 'readonly', [storeNames.EVENTS]);
      const countReq = t.objectStore(storeNames.EVENTS).count();
      const total = await new Promise<number>((res, rej) => {
        countReq.onsuccess = () => res(Number(countReq.result || 0));
        countReq.onerror = () => rej(asError(countReq.error, 'Failed to count events'));
      });
      snapshotEvery = chooseSnapshotEvery(total);
    } catch {
      snapshotEvery = 20;
    }
  }

  async function compactSnapshots() {
    if (isClosed) return;
    // Skip compaction for small histories
    const minCompactionHeight = snapshotEvery * (keepRecentSnapshots + 5);
    if (height < minCompactionHeight) return;
    // Collect heights to delete: keep latest N and periodic anchors
    const toDelete: number[] = [];
    try {
      const tRead = tx(db, 'readonly', [storeNames.SNAPSHOTS]);
      const curReq = tRead.objectStore(storeNames.SNAPSHOTS).openCursor(null, 'prev');
      let seen = 0;
      const period = anchorEvery();
      await new Promise<void>((res, rej) => {
        curReq.onsuccess = () => {
          const c = curReq.result;
          if (!c) return res();
          const h = Number(c.key);
          if (seen < keepRecentSnapshots) {
            seen++;
          } else {
            // Retain periodic anchors only
            if (period > 0 && h % period !== 0) {
              toDelete.push(h);
            }
          }
          c.continue();
        };
        curReq.onerror = () =>
          rej(asError(curReq.error, 'Failed reading snapshots for compaction'));
      });
    } catch {
      return;
    }
    if (!toDelete.length) return;
    try {
      const tDel = tx(db, 'readwrite', [storeNames.SNAPSHOTS]);
      for (const h of toDelete) {
        const delReq = tDel.objectStore(storeNames.SNAPSHOTS).delete(h);
        await new Promise<void>((res, rej) => {
          delReq.onsuccess = () => res();
          delReq.onerror = () => rej(asError(delReq.error, 'Failed deleting snapshot'));
        });
      }
    } catch {
      // best-effort; ignore failures
    }
  }

  function isPlainObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }
  function warn(code: string, info?: unknown) {
    try {
      onWarn?.(code, info);
    } catch {}
    // Dev-only console reporter for snapshot selection metrics
    if (
      DEV &&
      (code === 'rehydrate.snapshot_invalid_record' ||
        code === 'rehydrate.snapshot_ahead_of_events' ||
        code === 'rehydrate.no_valid_snapshot')
    ) {
      devLog(code, info);
    }
  }
  function isValidStateRecord(rec: unknown): rec is CurrentStateRecord {
    if (!isPlainObject(rec)) return false;
    const obj = rec;
    if (obj['id'] !== 'current' || typeof obj['height'] !== 'number') return false;
    const s = obj['state'];
    if (!isPlainObject(s)) return false;
    if (!isPlainObject(s.players) || !isPlainObject(s.scores)) return false;
    const playersObj = s.players;
    const scoresObj = s.scores;
    for (const k of Object.keys(playersObj)) if (typeof playersObj[k] !== 'string') return false;
    for (const k of Object.keys(scoresObj)) if (typeof scoresObj[k] !== 'number') return false;
    return true;
  }
  function upgradeState(s: AppState): AppState {
    // Ensure new roster keys exist with safe defaults without using any
    type BootFields = Partial<
      Pick<
        AppState,
        'rosters' | 'activeScorecardRosterId' | 'activeSingleRosterId' | 'humanByMode'
      >
    >;
    const boot = s as unknown as BootFields;
    const rosters: AppState['rosters'] = boot.rosters ?? {};
    const activeScorecardRosterId: UUID | null =
      typeof boot.activeScorecardRosterId === 'string' ? boot.activeScorecardRosterId : null;
    const activeSingleRosterId: UUID | null =
      typeof boot.activeSingleRosterId === 'string' ? boot.activeSingleRosterId : null;
    const humanByMode: AppState['humanByMode'] =
      boot.humanByMode && typeof boot.humanByMode === 'object' ? boot.humanByMode : {};

    let next: AppState = Object.assign({}, s, {
      rosters,
      activeScorecardRosterId,
      activeSingleRosterId,
      humanByMode,
    });

    // Bootstrap default scorecard roster from legacy players if rosters are empty
    const hasAnyRoster = Object.keys(next.rosters ?? {}).length > 0;
    const hasLegacyPlayers = next.players && Object.keys(next.players).length > 0;
    if (!hasAnyRoster && hasLegacyPlayers) {
      const rid: UUID = uuid();
      // Build display order from legacy mapping with dense fallback
      const legacyOrderEntries = Object.entries(next.display_order ?? {}).sort(
        (a, b) => a[1] - b[1],
      );
      const orderedIds = legacyOrderEntries.map(([pid]) => pid);
      for (const pid of Object.keys(next.players))
        if (!orderedIds.includes(pid)) orderedIds.push(pid);
      const displayOrder: Record<string, number> = {};
      for (let i = 0; i < orderedIds.length; i++) displayOrder[orderedIds[i]!] = i;
      const createdAt = Date.now();
      const playersById: Record<string, string> = { ...next.players };
      const roster = {
        name: 'Score Card',
        playersById,
        displayOrder,
        type: 'scorecard' as const,
        createdAt,
      };
      const newRosters: AppState['rosters'] = { [rid]: roster };
      next = Object.assign({}, next, { rosters: newRosters, activeScorecardRosterId: rid });
    }
    return next;
  }
  function isValidSnapshot(rec: unknown): rec is { height: number; state: AppState } {
    if (!isPlainObject(rec)) return false;
    const obj = rec;
    if (typeof obj['height'] !== 'number') return false;
    const s = obj['state'];
    if (!isPlainObject(s)) return false;
    if (!isPlainObject(s.players) || !isPlainObject(s.scores)) return false;
    const playersObj = s.players;
    const scoresObj = s.scores;
    for (const k of Object.keys(playersObj)) if (typeof playersObj[k] !== 'string') return false;
    for (const k of Object.keys(scoresObj)) if (typeof scoresObj[k] !== 'number') return false;
    return true;
  }
  function isValidEvent(e: unknown): e is AppEvent {
    return (
      isPlainObject(e) &&
      typeof e.type === 'string' &&
      typeof e.eventId === 'string' &&
      typeof e.ts === 'number'
    );
  }

  async function loadCurrent() {
    // Try fast path: current record
    const t1 = tx(db, 'readonly', [storeNames.STATE]);
    const req = t1.objectStore(storeNames.STATE).get('current');
    const rec = await new Promise<CurrentStateRecord | undefined>((res, rej) => {
      req.onsuccess = () => res(req.result as CurrentStateRecord | undefined);
      req.onerror = () => rej(asError(req.error, 'Failed to load current state'));
    });
    if (isValidStateRecord(rec)) {
      memoryState = upgradeState(rec.state);
      height = rec.height;
      return;
    }
    if (rec) {
      warn('state.invalid_current');
    }
    // Fallback: use the last valid snapshot not ahead of events
    try {
      // Determine latest event seq for sanity checks
      let latestSeq = 0;
      try {
        const tEv = tx(db, 'readonly', [storeNames.EVENTS]);
        const curEv = tEv.objectStore(storeNames.EVENTS).openCursor(null, 'prev');
        latestSeq = await new Promise<number>((res, rej) => {
          curEv.onsuccess = () => {
            const c = curEv.result;
            if (!c) return res(0);
            const k = Number(
              (c as IDBCursorWithValue & { primaryKey?: IDBValidKey }).primaryKey ?? c.key,
            );
            res(Number.isFinite(k) ? k : 0);
          };
          curEv.onerror = () => rej(asError(curEv.error, 'Failed reading latest event seq'));
        });
      } catch {
        latestSeq = 0;
      }
      const t2 = tx(db, 'readonly', [storeNames.SNAPSHOTS]);
      const curReq = t2.objectStore(storeNames.SNAPSHOTS).openCursor(null, 'prev');
      let tried = 0;
      let invalid = 0;
      let ahead = 0;
      const chosen = await new Promise<{ height: number; state: AppState } | undefined>(
        (res, rej) => {
          curReq.onsuccess = () => {
            const c = curReq.result;
            if (!c) return res(undefined);
            tried++;
            const v: unknown = c.value;
            if (!isValidSnapshot(v)) {
              invalid++;
              warn('rehydrate.snapshot_invalid_record');
              return c.continue();
            }
            if (v.height > latestSeq) {
              ahead++;
              warn('rehydrate.snapshot_ahead_of_events', { snapshotHeight: v.height, latestSeq });
              return c.continue();
            }
            return res(v);
          };
          curReq.onerror = () => rej(asError(curReq.error, 'Failed iterating snapshots'));
        },
      );
      if (chosen) {
        devLog('rehydrate.snapshot_chosen', { height: chosen.height, latestSeq });
        memoryState = chosen.state;
        height = chosen.height;
        return;
      }
      if (tried > 0) {
        warn('rehydrate.no_valid_snapshot', { tried, invalid, ahead });
      }
    } catch {
      // ignore snapshot failures; continue with initial
    }
    memoryState = upgradeState(INITIAL_STATE);
    height = 0;
    devLog('rehydrate.fallback_initial');
  }

  async function applyTail(fromExclusive: number) {
    if (isClosed) return;
    const t = tx(db, 'readonly', [storeNames.EVENTS]);
    const range = IDBKeyRange.lowerBound(fromExclusive + 1);
    const cursorReq = t.objectStore(storeNames.EVENTS).openCursor(range);
    await new Promise<void>((res, rej) => {
      cursorReq.onsuccess = () => {
        const cur = cursorReq.result;
        if (!cur) return res();
        const ev = cur.value as unknown;
        if (isValidEvent(ev)) {
          memoryState = reduce(memoryState, ev);
        } else {
          warn('rehydrate.malformed_event');
        }
        height = Number(cur.primaryKey ?? cur.key);
        cur.continue();
      };
      cursorReq.onerror = () => rej(asError(cursorReq.error, 'Failed reading event tail'));
    });
  }

  async function persistCurrent() {
    if (isClosed) return;
    const t = tx(db, 'readwrite', [storeNames.STATE]);
    const req = t
      .objectStore(storeNames.STATE)
      .put({ id: 'current', height, state: memoryState } as CurrentStateRecord);
    await new Promise<void>((res, rej) => {
      req.onsuccess = () => res();
      req.onerror = () => rej(asError(req.error, 'Failed to persist current state'));
      t.onabort = () => rej(asError(t.error, 'Transaction aborted persisting current state'));
      t.onerror = () => rej(asError(t.error, 'Transaction error persisting current state'));
    });
  }

  if (chan) {
    chan.addEventListener('message', (ev: MessageEvent) => {
      const data: unknown = ev?.data;
      if (isPlainObject(data) && data.type === 'reset') {
        void enqueueCatchUp(async () => {
          await replaceDB();
          await rehydrate();
          notify();
        });
        return;
      }
      const seq = Number(isPlainObject(data) ? data.seq : undefined);
      if (!Number.isFinite(seq)) return;
      void enqueueCatchUp(async () => {
        await applyTail(height);
        await persistCurrent();
        notify();
      });
    });
  } else if (typeof addEventListener === 'function') {
    addEventListener('storage', (ev: StorageEvent) => {
      if (!ev) return;
      if (ev.key === `app-events:signal:${dbName}` && ev.newValue === 'reset') {
        void enqueueCatchUp(async () => {
          await replaceDB();
          await rehydrate();
          notify();
        });
        return;
      }
      if (ev.key !== `app-events:lastSeq:${dbName}`) return;
      const seq = Number(ev.newValue);
      if (!Number.isFinite(seq)) return;
      void enqueueCatchUp(async () => {
        await applyTail(height);
        await persistCurrent();
        notify();
      });
    });
  }

  async function rehydrate() {
    await initSnapshotStrategy();
    await loadCurrent();
    await applyTail(height);
    // Ensure any missing roster scaffolding is bootstrapped before persisting
    memoryState = upgradeState(memoryState);
    await persistCurrent();
    notify();
  }

  await rehydrate();

  let testFailMode: 'quota' | 'generic' | null = null;
  let testAbortAfterAdd = false;

  async function append(event: AppEvent): Promise<number> {
    // Validate event shape and payload before attempting to write
    try {
      // Ensure strict KnownAppEvent
      event = validateEventStrict(event);
    } catch (err: unknown) {
      const info = (err as { info?: unknown } | null)?.info;
      const codeFromInfo = (info as { code?: string } | null)?.code;
      const code: string = codeFromInfo ?? 'append.invalid_event_shape';
      warn(code, info);
      const ex: Error & { code: string; info?: unknown } = Object.assign(
        new Error('InvalidEvent'),
        { name: 'InvalidEvent', code, info },
      );
      throw ex;
    }
    if (testFailMode) {
      const name = testFailMode === 'quota' ? 'QuotaExceededError' : 'TestAppendError';
      testFailMode = null;
      const err = Object.assign(new Error(name), { name });
      throw err;
    }
    // Special test hook: add and then abort single transaction to ensure atomic rollback
    if (testAbortAfterAdd) {
      testAbortAfterAdd = false;
      const t = tx(db, 'readwrite', [storeNames.EVENTS, storeNames.STATE]);
      const addReq = t.objectStore(storeNames.EVENTS).add(event);
      await new Promise<void>((res, rej) => {
        addReq.onsuccess = () => res();
        addReq.onerror = () => rej(asError(addReq.error, 'Failed to add test event'));
      });
      try {
        t.abort();
      } catch {}
      const err = Object.assign(new Error('AbortedAfterAdd'), { name: 'AbortedAfterAdd' });
      throw err;
    }
    // Phase 1: attempt to add the event in its own transaction
    let seq: number | undefined;
    try {
      const tAdd = tx(db, 'readwrite', [storeNames.EVENTS]);
      const addReq = tAdd.objectStore(storeNames.EVENTS).add(event);
      seq = await new Promise<number>((res, rej) => {
        addReq.onsuccess = () => res(addReq.result as number);
        addReq.onerror = () => rej(asError(addReq.error, 'Failed to add event'));
        tAdd.onabort = () => rej(asError(tAdd.error, 'Transaction aborted adding event'));
        tAdd.onerror = () => rej(asError(tAdd.error, 'Transaction error adding event'));
      });
    } catch (err: unknown) {
      // Treat duplicate eventId as idempotent success; look up existing seq
      const name = (err as { name?: string } | null)?.name;
      const message = err instanceof Error ? err.message : '';
      if (err && (name === 'ConstraintError' || message.includes('Constraint'))) {
        const tFind = tx(db, 'readonly', [storeNames.EVENTS]);
        const idx = tFind.objectStore(storeNames.EVENTS).index('eventId');
        const getReq = idx.getKey(event.eventId);
        seq = await new Promise<number>((res, rej) => {
          getReq.onsuccess = () => res((getReq.result as number) ?? height);
          getReq.onerror = () => rej(asError(getReq.error, 'Failed to lookup duplicate event'));
        });
      } else {
        throw err;
      }
    }
    // Optional test hook: abort after add but before state put
    if (testAbortAfterAdd) {
      testAbortAfterAdd = false;
      const err = Object.assign(new Error('AbortedAfterAdd'), { name: 'AbortedAfterAdd' });
      throw err;
    }
    // apply/persist: always catch up by applying tail from current height
    // This ensures we process any missing earlier events before (and including) this one
    await enqueueCatchUp(async () => {
      await applyTail(height);
      // Phase 2: persist current state and optional snapshot in a separate transaction
      const tPersist = tx(db, 'readwrite', [storeNames.STATE, storeNames.SNAPSHOTS]);
      const putReq = tPersist
        .objectStore(storeNames.STATE)
        .put({ id: 'current', height, state: memoryState } as CurrentStateRecord);
      await new Promise<void>((res, rej) => {
        putReq.onsuccess = () => res();
        putReq.onerror = () => rej(asError(putReq.error, 'Failed to persist state during append'));
        tPersist.onabort = () =>
          rej(asError(tPersist.error, 'Transaction aborted persisting state'));
        tPersist.onerror = () => rej(asError(tPersist.error, 'Transaction error persisting state'));
      });
      if (height % snapshotEvery === 0) {
        const snapPut = tPersist
          .objectStore(storeNames.SNAPSHOTS)
          .put({ height, state: memoryState });
        await new Promise<void>((res, rej) => {
          snapPut.onsuccess = () => res();
          snapPut.onerror = () => rej(asError(snapPut.error, 'Failed to persist snapshot'));
        });
        // Opportunistic background compaction (non-blocking)
        try {
          setTimeout(() => {
            compactSnapshots().catch(() => {});
          }, 0);
        } catch {}
      }
    });
    if (chan) {
      chan.postMessage({ type: 'append', seq });
    } else if (typeof localStorage !== 'undefined') {
      try {
        const key = `app-events:lastSeq:${dbName}`;
        const val = String(seq);
        localStorage.setItem(key, val);
        // In some environments, 'storage' may not fire across contexts. Best-effort dispatch.
        try {
          const EvCtor = StorageEvent as unknown as {
            new (type: string, eventInitDict?: StorageEventInit): StorageEvent;
          };
          const ev = new EvCtor('storage', { key, newValue: val, storageArea: localStorage });
          dispatchEvent(ev);
        } catch {}
      } catch {}
    }
    notify();
    return seq;
  }

  async function appendMany(batch: AppEvent[]): Promise<number> {
    // Short-circuit empty batches
    if (!Array.isArray(batch) || batch.length === 0) return height;
    // Validate all events strict first
    let validated: AppEvent[] = [];
    try {
      validated = batch.map((e) => validateEventStrict(e));
    } catch (err: unknown) {
      const info = (err as { info?: unknown } | null)?.info;
      const codeFromInfo = (info as { code?: string } | null)?.code;
      const code: string = codeFromInfo ?? 'append.invalid_event_shape';
      warn(code, info);
      const ex: Error & { code: string; info?: unknown } = Object.assign(
        new Error('InvalidEvent'),
        { name: 'InvalidEvent', code, info },
      );
      throw ex;
    }
    // Optional test failure hooks (match single-append semantics best-effort)
    if (testFailMode) {
      const name = testFailMode === 'quota' ? 'QuotaExceededError' : 'TestAppendError';
      testFailMode = null;
      const err = Object.assign(new Error(name), { name });
      throw err;
    }
    if (testAbortAfterAdd) {
      // For batch, simulate by adding first event then aborting
      testAbortAfterAdd = false;
      const t = tx(db, 'readwrite', [storeNames.EVENTS, storeNames.STATE]);
      const addReq = t.objectStore(storeNames.EVENTS).add(validated[0]!);
      await new Promise<void>((res, rej) => {
        addReq.onsuccess = () => res();
        addReq.onerror = () => rej(asError(addReq.error, 'Failed to add test event (batch)'));
      });
      try {
        t.abort();
      } catch {}
      const err = Object.assign(new Error('AbortedAfterAdd'), { name: 'AbortedAfterAdd' });
      throw err;
    }
    // Phase 1: insert all events in a single transaction, skipping duplicates by eventId
    let lastSeq: number = height;
    try {
      const tAdd = tx(db, 'readwrite', [storeNames.EVENTS]);
      const store = tAdd.objectStore(storeNames.EVENTS);
      const byEventId = store.index('eventId');
      for (const ev of validated) {
        // Check duplicate by eventId within same txn to avoid Constraint aborts
        const getKeyReq = byEventId.getKey((ev as { eventId: string }).eventId);
        const existingKey = await new Promise<number | undefined>((res, rej) => {
          getKeyReq.onsuccess = () => res((getKeyReq.result as number | undefined) ?? undefined);
          getKeyReq.onerror = () =>
            rej(asError(getKeyReq.error, 'Failed to lookup duplicate (batch)'));
        });
        if (typeof existingKey === 'number') {
          // Skip duplicate
          lastSeq = Math.max(lastSeq, existingKey);
          continue;
        }
        const addReq = store.add(ev);
        const seq = await new Promise<number>((res, rej) => {
          addReq.onsuccess = () => res(addReq.result as number);
          addReq.onerror = () => rej(asError(addReq.error, 'Failed to add event (batch)'));
          // tAdd abort/error handled at txn level below
        });
        if (Number.isFinite(seq)) lastSeq = Math.max(lastSeq, seq);
      }
      await new Promise<void>((res, rej) => {
        tAdd.oncomplete = () => res();
        tAdd.onabort = () => rej(asError(tAdd.error, 'Transaction aborted adding batch'));
        tAdd.onerror = () => rej(asError(tAdd.error, 'Transaction error adding batch'));
      });
    } catch (err) {
      throw err;
    }
    // Phase 2: catch up apply + persist in one pass
    await enqueueCatchUp(async () => {
      await applyTail(height);
      const tPersist = tx(db, 'readwrite', [storeNames.STATE, storeNames.SNAPSHOTS]);
      const putReq = tPersist
        .objectStore(storeNames.STATE)
        .put({ id: 'current', height, state: memoryState } as CurrentStateRecord);
      await new Promise<void>((res, rej) => {
        putReq.onsuccess = () => res();
        putReq.onerror = () =>
          rej(asError(putReq.error, 'Failed to persist state during appendMany'));
        tPersist.onabort = () =>
          rej(asError(tPersist.error, 'Transaction aborted persisting state (batch)'));
        tPersist.onerror = () =>
          rej(asError(tPersist.error, 'Transaction error persisting state (batch)'));
      });
      if (height % snapshotEvery === 0) {
        const snapPut = tPersist
          .objectStore(storeNames.SNAPSHOTS)
          .put({ height, state: memoryState });
        await new Promise<void>((res, rej) => {
          snapPut.onsuccess = () => res();
          snapPut.onerror = () => rej(asError(snapPut.error, 'Failed to persist snapshot (batch)'));
        });
        try {
          setTimeout(() => {
            compactSnapshots().catch(() => {});
          }, 0);
        } catch {}
      }
    });
    if (chan) {
      chan.postMessage({ type: 'append', seq: lastSeq });
    } else if (typeof localStorage !== 'undefined') {
      try {
        const key = `app-events:lastSeq:${dbName}`;
        const val = String(lastSeq);
        localStorage.setItem(key, val);
        try {
          const EvCtor = StorageEvent as unknown as {
            new (type: string, eventInitDict?: StorageEventInit): StorageEvent;
          };
          const ev = new EvCtor('storage', { key, newValue: val, storageArea: localStorage });
          dispatchEvent(ev);
        } catch {}
      } catch {}
    }
    notify();
    return lastSeq;
  }

  function getState() {
    return memoryState;
  }
  function getHeight() {
    return height;
  }
  function close() {
    isClosed = true;
    try {
      chan?.close();
    } catch {}
    try {
      db.close();
    } catch {}
  }
  function subscribe(cb: (s: AppState, h: number) => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }
  function setTestAppendFailure(mode: 'quota' | 'generic' | null) {
    testFailMode = mode;
  }
  function setTestAbortAfterAddOnce() {
    testAbortAfterAdd = true;
  }

  return {
    append,
    appendMany,
    getState,
    getHeight,
    rehydrate,
    close,
    subscribe,
    setTestAppendFailure,
    setTestAbortAfterAddOnce,
  } as Instance & {
    setTestAppendFailure: typeof setTestAppendFailure;
    setTestAbortAfterAddOnce: typeof setTestAbortAfterAddOnce;
  };
}
