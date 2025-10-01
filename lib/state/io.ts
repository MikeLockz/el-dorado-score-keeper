import { openDB, storeNames, tx } from './db';
import type { AppEvent, AppState } from './types';
import { INITIAL_STATE, reduce } from './types';
import { events } from './events';
import { uuid } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { withSpan } from '@/lib/observability/spans';

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
    mode?: 'scorecard' | 'single-player';
    scorecard?: {
      activeRound: number | null;
    };
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
  return withSpan(
    'state.export-bundle',
    { dbName },
    async (span) => {
      const db = await openDB(dbName);
      try {
        const t = tx(db, 'readonly', [storeNames.EVENTS]);
        const store = t.objectStore(storeNames.EVENTS);
        const cursorReq = store.openCursor();
        const exportEvents: AppEvent[] = [];
        let lastSeq = 0;

        await new Promise<void>((res, rej) => {
          cursorReq.onsuccess = () => {
            const cur = cursorReq.result;
            if (!cur) return res();
            exportEvents.push(cur.value as AppEvent);
            lastSeq = Number(cur.primaryKey ?? cur.key ?? lastSeq);
            cur.continue();
          };
          cursorReq.onerror = () =>
            rej(asError(cursorReq.error, 'Failed reading events during export'));
        });

        span?.setAttribute('events.count', exportEvents.length);
        span?.setAttribute('latest.seq', lastSeq);

        return { latestSeq: lastSeq, events: exportEvents } satisfies ExportBundle;
      } finally {
        db.close();
      }
    },
    { runtime: 'browser' },
  );
}

export async function importBundle(dbName: string, bundle: ExportBundle): Promise<void> {
  return withSpan(
    'state.import-bundle',
    { dbName, eventCount: bundle.events.length },
    async (span) => {
      await new Promise<void>((res, _rej) => {
        const del = indexedDB.deleteDatabase(dbName);
        del.onsuccess = () => res();
        del.onerror = () => {
          res();
        };
        del.onblocked = () => {
          res();
        };
      });

      const db = await openDB(dbName);
      try {
        const t = tx(db, 'readwrite', [storeNames.EVENTS]);
        const store = t.objectStore(storeNames.EVENTS);
        for (const e of bundle.events) {
          await new Promise<void>((res) => {
            const r = store.add(e);
            r.onsuccess = () => res();
            r.onerror = () => {
              res();
            };
          });
        }
        await new Promise<void>((res, rej) => {
          t.oncomplete = () => res();
          t.onerror = () => rej(asError(t.error, 'Transaction error importing bundle'));
          t.onabort = () => rej(asError(t.error, 'Transaction aborted importing bundle'));
        });
        span?.setAttribute('latest.seq', bundle.latestSeq ?? bundle.events.length);
      } finally {
        db.close();
      }
    },
    { runtime: 'browser' },
  );
}

// Replace DB contents without deleting the database to avoid blocked deletions.
export async function importBundleSoft(dbName: string, bundle: ExportBundle): Promise<void> {
  return withSpan(
    'state.import-bundle-soft',
    { dbName, eventCount: bundle.events.length },
    async (span) => {
      const db = await openDB(dbName);
      try {
        const t = tx(db, 'readwrite', [storeNames.EVENTS, storeNames.STATE, storeNames.SNAPSHOTS]);
        const eventsStore = t.objectStore(storeNames.EVENTS);
        const stateStore = t.objectStore(storeNames.STATE);
        const snapsStore = t.objectStore(storeNames.SNAPSHOTS);

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

        for (const e of bundle.events) {
          await new Promise<void>((res) => {
            const r = eventsStore.add(e);
            r.onsuccess = () => res();
            r.onerror = () => res();
          });
        }

        const finalState = reduceBundle(bundle);
        const h = bundle.latestSeq ?? bundle.events.length;

        await new Promise<void>((res, rej) => {
          const r = stateStore.put({ id: 'current', height: h, state: finalState });
          r.onsuccess = () => res();
          r.onerror = () => rej(asError(r.error, 'Failed writing current state'));
        });
        span?.setAttribute('latest.seq', h);
        span?.setAttribute('rounds.count', Object.keys(finalState.rounds ?? {}).length);

        await new Promise<void>((res, rej) => {
          t.oncomplete = () => res();
          t.onerror = () => rej(asError(t.error, 'Transaction error importing bundle (soft)'));
          t.onabort = () => rej(asError(t.error, 'Transaction aborted importing bundle (soft)'));
        });
      } finally {
        db.close();
      }
    },
    { runtime: 'browser' },
  );
}

export async function previewAt(dbName: string, h: number): Promise<AppState> {
  return withSpan(
    'state.preview-at',
    { dbName, height: h },
    async (span) => {
      const db = await openDB(dbName);
      try {
        let base: AppState = INITIAL_STATE;
        let baseH = 0;
        try {
          const st = tx(db, 'readonly', [storeNames.SNAPSHOTS]);
          const curReq = st
            .objectStore(storeNames.SNAPSHOTS)
            .openCursor(IDBKeyRange.upperBound(h), 'prev');
          const snap = await new Promise<{ height: number; state: AppState } | undefined>(
            (res, rej) => {
              curReq.onsuccess = () => {
                const c = curReq.result;
                if (!c) return res(undefined);
                res(c.value as { height: number; state: AppState });
              };
              curReq.onerror = () =>
                rej(asError(curReq.error, 'Failed reading snapshot for preview'));
            },
          );
          if (snap && typeof snap.height === 'number' && snap.state) {
            base = snap.state;
            baseH = snap.height;
          }
        } catch {}

        const t = tx(db, 'readonly', [storeNames.EVENTS]);
        const req = t.objectStore(storeNames.EVENTS).openCursor(IDBKeyRange.lowerBound(baseH + 1));
        let state = base;
        let replayed = 0;
        await new Promise<void>((res, rej) => {
          req.onsuccess = () => {
            const cur = req.result;
            if (!cur) return res();
            const seq = Number(cur.primaryKey ?? cur.key);
            if (seq <= h) {
              state = reduce(state, cur.value as AppEvent);
              replayed += 1;
              cur.continue();
            } else {
              res();
            }
          };
          req.onerror = () => rej(asError(req.error, 'Failed iterating events for preview'));
        });

        span?.setAttribute('snapshot.height', baseH);
        span?.setAttribute('events.replayed', replayed);

        return state;
      } finally {
        db.close();
      }
    },
    { runtime: 'browser' },
  );
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
  const roundsEntries = Object.entries(s.rounds ?? {});
  let latestActiveRound: number | null = null;
  for (const [rk, round] of roundsEntries) {
    const rn = Number(rk);
    if (!Number.isFinite(rn) || !round) continue;
    const bids = Object.values(round.bids ?? {});
    const made = Object.values(round.made ?? {});
    const presentFlags = Object.values(round.present ?? {});
    const roundActive =
      round.state !== 'locked' ||
      bids.some((b) => b != null && b !== 0) ||
      made.some((m) => m != null) ||
      presentFlags.some((p) => p === false);
    if (roundActive) {
      if (latestActiveRound == null || rn > latestActiveRound) {
        latestActiveRound = rn;
      }
    }
  }

  if (latestActiveRound == null && roundsEntries.length > 0) {
    latestActiveRound = 1;
  }

  const spUnknown = (s as unknown as { sp?: unknown }).sp;
  const sp = (spUnknown && typeof spUnknown === 'object' ? spUnknown : {}) as Partial<
    AppState['sp']
  >;
  const spPhase = sp.phase ?? 'setup';
  const spActive =
    spPhase !== 'setup' &&
    spPhase !== 'game-summary' &&
    spPhase !== 'done' &&
    ((sp.trickPlays?.length ?? 0) > 0 || Object.keys(sp.hands ?? {}).length > 0);
  const mode: 'scorecard' | 'single-player' = spActive ? 'single-player' : 'scorecard';
  return {
    players: Object.keys(playersById).length,
    scores,
    playersById,
    winnerId,
    winnerName: winnerId ? (playersById[winnerId] ?? null) : null,
    winnerScore,
    mode,
    scorecard: {
      activeRound: latestActiveRound,
    },
    sp: {
      phase: spPhase,
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
  return withSpan(
    'state.games-list',
    { dbName: gamesDbName },
    async (span) => {
      const db = await openDB(gamesDbName);
      try {
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
        out.sort((a, b) => b.createdAt - a.createdAt);
        span?.setAttribute('games.count', out.length);
        span?.setAttribute('index.used', useIndex);
        return out;
      } finally {
        db.close();
      }
    },
    { runtime: 'browser' },
  );
}

export async function getGame(
  gamesDbName: string = GAMES_DB_NAME,
  id: string,
): Promise<GameRecord | null> {
  return withSpan(
    'state.game-get',
    { dbName: gamesDbName, gameId: id },
    async (span) => {
      const db = await openDB(gamesDbName);
      try {
        const t = tx(db, 'readonly', [storeNames.GAMES]);
        const req = t.objectStore(storeNames.GAMES).get(id);
        const rec = await new Promise<GameRecord | null>((res, rej) => {
          req.onsuccess = () => res((req.result as GameRecord | null) ?? null);
          req.onerror = () => rej(asError(req.error, 'Failed to get game record'));
        });
        span?.setAttribute('game.found', !!rec);
        return rec;
      } finally {
        db.close();
      }
    },
    { runtime: 'browser' },
  );
}

export async function deleteGame(gamesDbName: string = GAMES_DB_NAME, id: string): Promise<void> {
  await withSpan(
    'state.game-delete',
    { dbName: gamesDbName, gameId: id },
    async () => {
      const db = await openDB(gamesDbName);
      try {
        const t = tx(db, 'readwrite', [storeNames.GAMES]);
        const req = t.objectStore(storeNames.GAMES).delete(id);
        await new Promise<void>((res, rej) => {
          req.onsuccess = () => res();
          req.onerror = () => rej(asError(req.error, 'Failed to delete game record'));
        });
      } finally {
        db.close();
      }
    },
    { runtime: 'browser' },
  );
}

export async function archiveCurrentGameAndReset(
  dbName: string = DEFAULT_DB_NAME,
  opts?: { title?: string },
): Promise<GameRecord | null> {
  return withSpan(
    'state.archive-and-reset',
    { dbName, hasTitle: !!opts?.title },
    async (span) => {
      const bundle = await exportBundle(dbName);
      span?.setAttribute('events.count', bundle.events.length);

      if (!bundle.latestSeq || bundle.latestSeq <= 0) {
        await importBundle(dbName, { latestSeq: 0, events: [] });
        try {
          localStorage.setItem(`app-events:lastSeq:${dbName}`, '0');
        } catch {}
        span?.setAttribute('archived', false);
        return null;
      }

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
      const baseSeedEvent: AppEvent = events.spSeedSet(
        { seed: Math.floor(finishedAt) },
        { ts: finishedAt },
      );
      const seedEvents: AppEvent[] = [
        baseSeedEvent,
        ...Object.entries(endState.players).map(([pid, name], idx) => {
          const type = endState.playerDetails?.[pid]?.type ?? 'human';
          return events.playerAdded({ id: pid, name, type }, { ts: finishedAt + idx + 1 });
        }),
      ];

      function fail(code: string, info?: unknown): never {
        const ex: Error & { code: string; info?: unknown } = Object.assign(new Error(code), {
          name: code,
          code,
          info,
        });
        throw ex;
      }

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

      try {
        await importBundleSoft(dbName, { latestSeq: seedEvents.length, events: seedEvents });
      } catch (e) {
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
          fail('archive.reset_failed_and_rollback_failed', {
            error: String(e),
            rollbackError: String(delErr),
          });
        }
        fail('archive.reset_failed', { error: String(e) });
      }

      try {
        localStorage.setItem(`app-events:lastSeq:${dbName}`, String(seedEvents.length));
        localStorage.setItem(`app-events:signal:${dbName}`, 'reset');
        try {
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

      span?.setAttribute('archived', true);
      span?.setAttribute('seed.events', seedEvents.length);
      span?.setAttribute('archive.finishedAt', finishedAt);

      return rec;
    },
    { runtime: 'browser' },
  );
}

export async function restoreGame(dbName: string = DEFAULT_DB_NAME, id: string): Promise<void> {
  await withSpan(
    'state.restore-game',
    { dbName, gameId: id },
    async (span) => {
      const rec = await getGame(GAMES_DB_NAME, id);
      if (!rec) {
        span?.setAttribute('restored', false);
        return;
      }

      await importBundleSoft(dbName, rec.bundle);
      span?.setAttribute('restored', true);
      span?.setAttribute('events.count', rec.bundle.events.length);
      span?.setAttribute('last.seq', rec.lastSeq ?? 0);

      try {
        localStorage.setItem(`app-events:lastSeq:${dbName}`, String(rec.lastSeq || 0));
        localStorage.setItem(`app-events:signal:${dbName}`, 'reset');
        try {
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
    },
    { runtime: 'browser' },
  );
}

export type GameMode = 'single-player' | 'scorecard';

export function deriveGameMode(game: GameRecord): GameMode {
  const declaredMode = game.summary.mode;
  if (declaredMode === 'single-player' || declaredMode === 'scorecard') {
    return declaredMode;
  }

  const spPhase = game.summary.sp?.phase;
  if (spPhase && spPhase !== 'setup' && spPhase !== 'game-summary' && spPhase !== 'done') {
    return 'single-player';
  }

  return 'scorecard';
}

export function deriveGameRoute(game: GameRecord): '/single-player' | '/scorecard' {
  return deriveGameMode(game) === 'single-player' ? '/single-player' : '/scorecard';
}
