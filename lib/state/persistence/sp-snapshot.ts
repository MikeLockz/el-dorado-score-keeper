import { storeNames, tx } from '../db';
import type { AppState, RoundData, UUID } from '../types';
import { getCurrentSinglePlayerGameId } from '../utils';

export const SINGLE_PLAYER_SNAPSHOT_VERSION = 1 as const;
export const SINGLE_PLAYER_SNAPSHOT_STORAGE_KEY = 'el-dorado:sp:snapshot:v1';
const SP_SNAPSHOT_RECORD_KEY = 'sp/snapshot';
const SP_GAME_INDEX_RECORD_KEY = 'sp/game-index';
const MAX_GAME_INDEX_ENTRIES = 8;
export const SP_GAME_INDEX_RETENTION_MS = 1000 * 60 * 60 * 24 * 30;

export type SinglePlayerSnapshotV1 = Readonly<{
  version: typeof SINGLE_PLAYER_SNAPSHOT_VERSION;
  height: number;
  savedAt: number;
  gameId: UUID;
  rosterId: UUID | null;
  roster: Readonly<{
    playersById: Record<UUID, string>;
    playerTypesById: Record<UUID, 'human' | 'bot'>;
    displayOrder: Record<UUID, number>;
  }> | null;
  humanId: string | null;
  sp: AppState['sp'];
  rounds: Record<number, RoundData>;
  scores: Record<string, number>;
  analytics: Readonly<{
    sessionSeed: number | null;
    roundTallies: AppState['sp']['roundTallies'];
  }>;
}>;

export type SinglePlayerSnapshot = SinglePlayerSnapshotV1;

export type SnapshotPersistenceAdapters = {
  indexedDb?: SpSnapshotIndexedDbAdapter;
  localStorage?: SpSnapshotLocalStorageAdapter;
};

export type PersistSpSnapshotOptions = {
  gameId?: string | null;
  now?: () => number;
  adapters?: SnapshotPersistenceAdapters;
  force?: boolean;
  onWarn?: (code: string, info?: unknown) => void;
};

export type PersistSpSnapshotResult = {
  persisted: boolean;
  skippedReason?: 'state-null' | 'no-active-session' | 'dedupe';
  height: number;
  checksum?: number;
  snapshot?: SinglePlayerSnapshotV1;
  errors: Array<{ target: 'indexed-db' | 'local-storage'; error: unknown }>;
};

export type LoadLatestSnapshotOptions = {
  adapters?: SnapshotPersistenceAdapters;
  allowLocalStorageFallback?: boolean;
  onWarn?: (code: string, info?: unknown) => void;
};

export type LoadSnapshotByGameIdOptions = {
  gameId: string;
  adapters?: SnapshotPersistenceAdapters;
  allowLocalStorageFallback?: boolean;
  onWarn?: (code: string, info?: unknown) => void;
};

export type LoadSnapshotByGameIdResult = {
  snapshot: SinglePlayerSnapshotV1 | null;
  source: 'indexed-db' | 'local-storage' | null;
  entry: SpGameIndexEntry | null;
};

export type SpSnapshotIndexedDbAdapter = {
  write: (snapshot: SinglePlayerSnapshotV1 | null) => Promise<void>;
  read?: () => Promise<SinglePlayerSnapshotV1 | null>;
  readIndex?: () => Promise<Record<string, SpGameIndexEntry>>;
  clear?: () => Promise<void>;
};

export type SpSnapshotLocalStorageAdapter = {
  write: (payload: { serialized: string; snapshot: SinglePlayerSnapshotV1 }) => void | Promise<void>;
  read?: () => string | null;
  clear?: () => void | Promise<void>;
};

const dedupeCache: {
  height: number;
  checksum: number | null;
  gameId: string | null;
  persisted: boolean;
  inactiveCleared: boolean;
} = {
  height: -1,
  checksum: null,
  gameId: null,
  persisted: false,
  inactiveCleared: false,
};

const isBrowser = () => typeof window !== 'undefined';

const safeNow = (fallback?: () => number) => {
  if (typeof fallback === 'function') {
    try {
      return Number(fallback());
    } catch {}
  }
  if (typeof Date.now === 'function') return Date.now();
  return new Date().getTime();
};

function clonePlain<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {}
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
  return Boolean(value) && typeof (value as { then?: unknown }).then === 'function';
}

function readGameId(state: AppState, explicit?: string | null): string | null {
  if (typeof explicit === 'string') {
    const trimmed = explicit.trim();
    if (trimmed) return trimmed;
  }
  return getCurrentSinglePlayerGameId(state);
}

function deriveRoster(state: AppState): {
  rosterId: UUID | null;
  roster: SinglePlayerSnapshotV1['roster'];
} {
  const rosterId =
    typeof state.activeSingleRosterId === 'string' && state.activeSingleRosterId.trim()
      ? state.activeSingleRosterId
      : null;
  if (!rosterId) return { rosterId: null, roster: null };
  const roster = state.rosters?.[rosterId];
  if (!roster) return { rosterId: rosterId ?? null, roster: null };
  return {
    rosterId,
    roster: {
      playersById: clonePlain(roster.playersById),
      playerTypesById: clonePlain(roster.playerTypesById),
      displayOrder: clonePlain(roster.displayOrder),
    },
  };
}

function collectRelevantScoreIds(snapshotSp: AppState['sp'], roster: SinglePlayerSnapshotV1['roster']): Set<string> {
  const ids = new Set<string>();
  if (Array.isArray(snapshotSp.order)) {
    for (const id of snapshotSp.order) if (typeof id === 'string') ids.add(id);
  }
  if (snapshotSp.trickCounts) {
    for (const key of Object.keys(snapshotSp.trickCounts)) ids.add(key);
  }
  if (snapshotSp.hands) {
    for (const key of Object.keys(snapshotSp.hands)) ids.add(key);
  }
  if (Array.isArray(snapshotSp.trickPlays)) {
    for (const play of snapshotSp.trickPlays) {
      const pid = (play as { playerId?: unknown }).playerId;
      if (typeof pid === 'string') ids.add(pid);
    }
  }
  if (roster?.playersById) {
    for (const pid of Object.keys(roster.playersById)) if (typeof pid === 'string') ids.add(pid);
  }
  return ids;
}

function pickScores(source: AppState['scores'], ids: Set<string>): Record<string, number> {
  if (!ids.size) return {};
  const out: Record<string, number> = {};
  for (const id of ids) {
    const val = source[id];
    if (typeof val === 'number' && Number.isFinite(val)) {
      out[id] = val;
    }
  }
  return out;
}

function prepareForStableSerialization(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(prepareForStableSerialization);
  }
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const obj: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      obj[k] = prepareForStableSerialization(v);
    }
    return obj;
  }
  return value;
}

function serializeSnapshot(snapshot: SinglePlayerSnapshotV1): string {
  return JSON.stringify(prepareForStableSerialization(snapshot));
}

function fingerprintSnapshot(snapshot: SinglePlayerSnapshotV1): string {
  return JSON.stringify(
    prepareForStableSerialization({
      ...snapshot,
      savedAt: 0,
    }),
  );
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MOD = 1n << 53n;

export function computeSnapshotChecksum(serialized: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < serialized.length; i++) {
    hash ^= BigInt(serialized.charCodeAt(i));
    hash = (hash * FNV_PRIME) % FNV_MOD;
  }
  return Number(hash);
}

export function buildSinglePlayerSnapshot(
  state: AppState,
  height: number,
  opts?: { gameId?: string | null; savedAt?: number; now?: () => number },
): SinglePlayerSnapshotV1 | null {
  const gameId = readGameId(state, opts?.gameId ?? null);
  if (!gameId) return null;
  const { rosterId, roster } = deriveRoster(state);
  const sp = clonePlain(state.sp);
  const rounds = clonePlain(state.rounds);
  const scores = pickScores(state.scores, collectRelevantScoreIds(sp, roster));
  const savedAt = typeof opts?.savedAt === 'number' ? opts.savedAt : safeNow(opts?.now);
  return {
    version: SINGLE_PLAYER_SNAPSHOT_VERSION,
    height,
    savedAt,
    gameId,
    rosterId,
    roster,
    humanId: (state.humanByMode?.single ?? null) || null,
    sp,
    rounds,
    scores,
    analytics: {
      sessionSeed: typeof sp.sessionSeed === 'number' ? sp.sessionSeed : null,
      roundTallies: clonePlain(sp.roundTallies ?? {}),
    },
  };
}

export function resetSnapshotDedupeCache() {
  dedupeCache.height = -1;
  dedupeCache.checksum = null;
  dedupeCache.gameId = null;
  dedupeCache.persisted = false;
  dedupeCache.inactiveCleared = false;
}

export async function persistSpSnapshot(
  state: AppState | null,
  height: number,
  options: PersistSpSnapshotOptions = {},
): Promise<PersistSpSnapshotResult> {
  const errors: PersistSpSnapshotResult['errors'] = [];
  const adapters = options.adapters ?? {};
  if (!state) {
    resetSnapshotDedupeCache();
    if (adapters.indexedDb?.clear) {
      try {
        await adapters.indexedDb.clear();
      } catch (error) {
        errors.push({ target: 'indexed-db', error });
        options.onWarn?.('sp.snapshot.clear.indexeddb_failed', error);
      }
    }
    if (adapters.localStorage?.clear) {
      try {
        await adapters.localStorage.clear();
      } catch (error) {
        errors.push({ target: 'local-storage', error });
        options.onWarn?.('sp.snapshot.clear.localstorage_failed', error);
      }
    }
    dedupeCache.inactiveCleared = true;
    return { persisted: false, skippedReason: 'state-null', height, errors };
  }
  const snapshot = buildSinglePlayerSnapshot(state, height, {
    gameId: options.gameId ?? null,
    now: options.now,
  });
  if (!snapshot) {
    if (!dedupeCache.inactiveCleared) {
      if (adapters.indexedDb?.clear) {
        try {
          await adapters.indexedDb.clear();
        } catch (error) {
          errors.push({ target: 'indexed-db', error });
          options.onWarn?.('sp.snapshot.clear.indexeddb_failed', error);
        }
      }
      if (adapters.localStorage?.clear) {
        try {
          await adapters.localStorage.clear();
        } catch (error) {
          errors.push({ target: 'local-storage', error });
          options.onWarn?.('sp.snapshot.clear.localstorage_failed', error);
        }
      }
      dedupeCache.inactiveCleared = true;
      dedupeCache.persisted = false;
      dedupeCache.gameId = null;
      dedupeCache.checksum = null;
      dedupeCache.height = -1;
    }
    return { persisted: false, skippedReason: 'no-active-session', height, errors };
  }
  const fingerprint = fingerprintSnapshot(snapshot);
  const checksum = computeSnapshotChecksum(fingerprint);
  if (!options.force && dedupeCache.checksum === checksum && dedupeCache.height === height) {
    dedupeCache.persisted = true;
    dedupeCache.gameId = snapshot.gameId;
    dedupeCache.inactiveCleared = false;
    return { persisted: false, skippedReason: 'dedupe', height, checksum, snapshot, errors };
  }
  dedupeCache.checksum = checksum;
  dedupeCache.height = height;
  dedupeCache.persisted = true;
  dedupeCache.gameId = snapshot.gameId;
  dedupeCache.inactiveCleared = false;
  const serialized = serializeSnapshot(snapshot);
  if (adapters.indexedDb?.write) {
    try {
      await adapters.indexedDb.write(snapshot);
    } catch (error) {
      errors.push({ target: 'indexed-db', error });
      options.onWarn?.('sp.snapshot.persist.indexeddb_failed', error);
    }
  }
  if (adapters.localStorage?.write) {
    const enqueue = typeof queueMicrotask === 'function' ? queueMicrotask : (cb: () => void) => Promise.resolve().then(cb).catch(() => {});
    await new Promise<void>((resolve) => {
      enqueue(() => {
        try {
          const maybePromise = adapters.localStorage?.write({ serialized, snapshot });
          if (isPromiseLike<void>(maybePromise)) {
            Promise.resolve(maybePromise)
              .then(() => resolve())
              .catch((error) => {
                errors.push({ target: 'local-storage', error });
                options.onWarn?.('sp.snapshot.persist.localstorage_failed', error);
                resolve();
              });
          } else {
            resolve();
          }
        } catch (error) {
          errors.push({ target: 'local-storage', error });
          options.onWarn?.('sp.snapshot.persist.localstorage_failed', error);
          resolve();
        }
      });
    });
  }
  return { persisted: true, height, checksum, snapshot, errors };
}

export async function loadLatestSnapshot(
  options: LoadLatestSnapshotOptions = {},
): Promise<SinglePlayerSnapshotV1 | null> {
  const adapters = options.adapters ?? {};
  if (adapters.indexedDb?.read) {
    try {
      const fromDb = await adapters.indexedDb.read();
      if (fromDb && fromDb.version === SINGLE_PLAYER_SNAPSHOT_VERSION) {
        return fromDb;
      }
    } catch (error) {
      options.onWarn?.('sp.snapshot.load.indexeddb_failed', error);
    }
  }
  if (options.allowLocalStorageFallback === false) return null;
  if (adapters.localStorage?.read) {
    try {
      const raw = adapters.localStorage.read();
      if (typeof raw === 'string' && raw.trim()) {
        const parsed = JSON.parse(raw) as unknown;
        if (isValidSnapshot(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      options.onWarn?.('sp.snapshot.load.localstorage_failed', error);
    }
  }
  return null;
}

export async function loadSnapshotByGameId(
  options: LoadSnapshotByGameIdOptions,
): Promise<LoadSnapshotByGameIdResult> {
  const gameId = typeof options.gameId === 'string' ? options.gameId.trim() : '';
  if (!gameId) {
    return { snapshot: null, source: null, entry: null };
  }
  const adapters = options.adapters ?? {};
  let entry: SpGameIndexEntry | null = null;
  if (adapters.indexedDb?.readIndex) {
    try {
      const index = await adapters.indexedDb.readIndex();
      entry = index?.[gameId] ?? null;
    } catch (error) {
      options.onWarn?.('sp.snapshot.load.indexeddb_index_failed', error);
    }
  }
  if (entry && adapters.indexedDb?.read) {
    try {
      const snapshot = await adapters.indexedDb.read();
      if (snapshot && snapshot.version === SINGLE_PLAYER_SNAPSHOT_VERSION && snapshot.gameId === gameId) {
        return { snapshot, source: 'indexed-db', entry };
      }
    } catch (error) {
      options.onWarn?.('sp.snapshot.load.by_game_indexeddb_failed', error);
    }
  }
  if (options.allowLocalStorageFallback === false) {
    return { snapshot: null, source: null, entry };
  }
  if (adapters.localStorage?.read) {
    try {
      const raw = adapters.localStorage.read();
      if (typeof raw === 'string' && raw.trim()) {
        const parsed = JSON.parse(raw) as unknown;
        if (isValidSnapshot(parsed) && parsed.gameId === gameId) {
          const inferredEntry: SpGameIndexEntry = {
            height: parsed.height,
            savedAt: parsed.savedAt,
          };
          return {
            snapshot: parsed,
            source: 'local-storage',
            entry: entry ?? inferredEntry,
          };
        }
      }
    } catch (error) {
      options.onWarn?.('sp.snapshot.load.by_game_localstorage_failed', error);
    }
  }
  return { snapshot: null, source: null, entry };
}

export async function clearSnapshot(options: { adapters?: SnapshotPersistenceAdapters } = {}) {
  const adapters = options.adapters ?? {};
  resetSnapshotDedupeCache();
  if (adapters.indexedDb?.clear) {
    try {
      await adapters.indexedDb.clear();
    } catch {}
  }
  if (adapters.localStorage?.clear) {
    try {
      await adapters.localStorage.clear();
    } catch {}
  }
}

export function isValidSnapshot(value: unknown): value is SinglePlayerSnapshotV1 {
  if (!value || typeof value !== 'object') return false;
  if ((value as { version?: unknown }).version !== SINGLE_PLAYER_SNAPSHOT_VERSION) return false;
  if (typeof (value as { height?: unknown }).height !== 'number') return false;
  if (typeof (value as { savedAt?: unknown }).savedAt !== 'number') return false;
  if (typeof (value as { gameId?: unknown }).gameId !== 'string') return false;
  if (!(value as { sp?: unknown }).sp) return false;
  return true;
}

export function createLocalStorageAdapter(storage: Storage | null = isBrowser() ? window.localStorage : null): SpSnapshotLocalStorageAdapter {
  return {
    write: ({ serialized }) => {
      if (!storage) return;
      try {
        storage.setItem(SINGLE_PLAYER_SNAPSHOT_STORAGE_KEY, serialized);
      } catch (error) {
        throw error;
      }
    },
    read: () => {
      if (!storage) return null;
      try {
        return storage.getItem(SINGLE_PLAYER_SNAPSHOT_STORAGE_KEY);
      } catch {
        return null;
      }
    },
    clear: () => {
      if (!storage) return;
      try {
        storage.removeItem(SINGLE_PLAYER_SNAPSHOT_STORAGE_KEY);
      } catch (error) {
        throw error;
      }
    },
  };
}

export type SpGameIndexEntry = {
  height: number;
  savedAt: number;
};

type SpGameIndexRecord = {
  id: typeof SP_GAME_INDEX_RECORD_KEY;
  games: Record<string, SpGameIndexEntry>;
};

function coerceGameIndexEntries(value: unknown): Record<string, SpGameIndexEntry> {
  if (!value || typeof value !== 'object') return {};
  const games = (value as { games?: unknown }).games ?? value;
  if (!games || typeof games !== 'object') return {};
  const result: Record<string, SpGameIndexEntry> = {};
  for (const [key, rawEntry] of Object.entries(games as Record<string, unknown>)) {
    if (typeof key !== 'string' || !rawEntry || typeof rawEntry !== 'object') continue;
    const heightRaw = Number((rawEntry as { height?: unknown }).height);
    if (!Number.isFinite(heightRaw) || heightRaw < 0) continue;
    const savedAtRaw = Number((rawEntry as { savedAt?: unknown }).savedAt);
    result[key] = {
      height: Math.max(0, Math.floor(heightRaw)),
      savedAt: Number.isFinite(savedAtRaw) ? savedAtRaw : 0,
    };
  }
  return result;
}

function trimGameIndexEntries(entries: Record<string, SpGameIndexEntry>): Record<string, SpGameIndexEntry> {
  const now = safeNow();
  const cutoff =
    SP_GAME_INDEX_RETENTION_MS > 0 ? now - SP_GAME_INDEX_RETENTION_MS : Number.NEGATIVE_INFINITY;
  const pairs = Object.entries(entries).filter(([, entry]) => {
    if (!entry || !Number.isFinite(entry.height)) return false;
    const savedAt = Number.isFinite(entry.savedAt) ? entry.savedAt : null;
    if (savedAt && savedAt < cutoff) {
      return false;
    }
    return true;
  });
  pairs.sort(([, a], [, b]) => {
    const savedDiff = (b.savedAt ?? 0) - (a.savedAt ?? 0);
    if (savedDiff !== 0) return savedDiff;
    return (b.height ?? 0) - (a.height ?? 0);
  });
  const trimmed: Record<string, SpGameIndexEntry> = {};
  for (const [key, entry] of pairs.slice(0, MAX_GAME_INDEX_ENTRIES)) {
    trimmed[key] = {
      height: Math.max(0, Math.floor(entry.height ?? 0)),
      savedAt: Number.isFinite(entry.savedAt) ? entry.savedAt : 0,
    };
  }
  return trimmed;
}

export function createIndexedDbAdapter(db: IDBDatabase): SpSnapshotIndexedDbAdapter {
  return {
    write: async (snapshot) => {
      const t = tx(db, 'readwrite', [storeNames.STATE]);
      const store = t.objectStore(storeNames.STATE);

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        const fail = (err: unknown) => {
          if (settled) return;
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err ?? 'Unknown error')));
        };

        t.oncomplete = finish;
        t.onabort = () => fail(t.error ?? new Error('Transaction aborted persisting SP snapshot'));
        t.onerror = () => fail(t.error ?? new Error('Transaction error persisting SP snapshot'));

        const indexReq = store.get(SP_GAME_INDEX_RECORD_KEY);
        indexReq.onerror = () => fail(indexReq.error ?? new Error('Failed to load SP game index'));
        indexReq.onsuccess = () => {
          const record = (indexReq.result as SpGameIndexRecord | null) ?? null;
          const existingIndex = coerceGameIndexEntries(record?.games ?? record ?? {});
          const nextEntries = { ...existingIndex, [snapshot.gameId]: { height: snapshot.height, savedAt: snapshot.savedAt } };
          const trimmed = trimGameIndexEntries(nextEntries);

          const putSnapshot = store.put({ id: SP_SNAPSHOT_RECORD_KEY, snapshot });
          putSnapshot.onerror = () => fail(putSnapshot.error ?? new Error('Failed to persist SP snapshot'));

          const putIndex = store.put({ id: SP_GAME_INDEX_RECORD_KEY, games: trimmed } as SpGameIndexRecord);
          putIndex.onerror = () => fail(putIndex.error ?? new Error('Failed to persist SP game index'));
        };
      });
    },
    read: async () => {
      const t = tx(db, 'readonly', [storeNames.STATE]);
      const req = t.objectStore(storeNames.STATE).get(SP_SNAPSHOT_RECORD_KEY);
      return await new Promise<SinglePlayerSnapshotV1 | null>((resolve, reject) => {
        req.onsuccess = () => {
          const record = req.result as { snapshot?: unknown } | null;
          const snapshot = record?.snapshot as SinglePlayerSnapshotV1 | null;
          resolve(snapshot ?? null);
        };
        req.onerror = () => reject(req.error ?? new Error('Failed to load SP snapshot'));
      });
    },
    clear: async () => {
      const t = tx(db, 'readwrite', [storeNames.STATE]);
      const store = t.objectStore(storeNames.STATE);
      const delSnapshot = store.delete(SP_SNAPSHOT_RECORD_KEY);
      await new Promise<void>((resolve, reject) => {
        delSnapshot.onsuccess = () => resolve();
        delSnapshot.onerror = () => reject(delSnapshot.error ?? new Error('Failed to delete SP snapshot'));
        t.onabort = () => reject(t.error ?? new Error('Transaction aborted clearing SP snapshot'));
        t.onerror = () => reject(t.error ?? new Error('Transaction error clearing SP snapshot'));
      });
      const delIndex = store.delete(SP_GAME_INDEX_RECORD_KEY);
      await new Promise<void>((resolve, reject) => {
        delIndex.onsuccess = () => resolve();
        delIndex.onerror = () => reject(delIndex.error ?? new Error('Failed to delete SP game index'));
        t.onabort = () => reject(t.error ?? new Error('Transaction aborted clearing SP game index'));
        t.onerror = () => reject(t.error ?? new Error('Transaction error clearing SP game index'));
      });
    },
    readIndex: async () => {
      const t = tx(db, 'readonly', [storeNames.STATE]);
      const req = t.objectStore(storeNames.STATE).get(SP_GAME_INDEX_RECORD_KEY);
      return await new Promise<Record<string, SpGameIndexEntry>>((resolve, reject) => {
        req.onsuccess = () => {
          const record = (req.result as SpGameIndexRecord | null) ?? null;
          resolve(coerceGameIndexEntries(record?.games ?? record ?? {}));
        };
        req.onerror = () => reject(req.error ?? new Error('Failed to load SP game index'));
      });
    },
  };
}
