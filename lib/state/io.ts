import { openDB, storeNames, tx } from './db';
import type { AppEvent, AppState } from './types';
import { INITIAL_STATE, reduce } from './types';
import { events } from './events';
import {
  clearSnapshot,
  createIndexedDbAdapter,
  createLocalStorageAdapter,
} from './persistence/sp-snapshot';
import { uuid } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { withSpan } from '@/lib/observability/spans';
import { captureBrowserMessage } from '@/lib/observability/browser';
import { scorecardPath, singlePlayerPath } from './utils';
import { emitGamesSignal } from './game-signals';
import { selectIsGameComplete } from './selectors';

export type ExportBundle = {
  latestSeq: number;
  events: AppEvent[];
};

export type SummaryMetadata = Readonly<{
  version: number;
  generatedAt: number;
}>;

export type RosterSnapshot = Readonly<{
  rosterId: string | null;
  playersById: Record<string, string>;
  playerTypesById: Record<string, 'human' | 'bot'>;
  displayOrder: Record<string, number>;
}>;

export type SummarySlotMapping = Readonly<{
  aliasToId: Record<string, string>;
}>;

export const SUMMARY_METADATA_VERSION = 2;

function normalizeAlias(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s+/g, ' ').toLocaleLowerCase();
}

function normalizeDisplayIndex(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

function derivePlayerTypesById(
  state: AppState,
  rosterPlayerTypes: Record<string, 'human' | 'bot'> | undefined,
  playerIds: ReadonlyArray<string>,
): Record<string, 'human' | 'bot'> {
  const out: Record<string, 'human' | 'bot'> = {};
  for (const pid of playerIds) {
    const rosterType = rosterPlayerTypes?.[pid];
    if (rosterType === 'human' || rosterType === 'bot') {
      out[pid] = rosterType;
      continue;
    }
    const detailType = state.playerDetails?.[pid]?.type;
    if (detailType === 'human' || detailType === 'bot') {
      out[pid] = detailType;
      continue;
    }
    out[pid] = 'human';
  }
  return out;
}

function deriveDisplayOrderFromSources(
  rosterDisplayOrder: Record<string, number> | undefined,
  stateDisplayOrder: Record<string, number> | undefined,
  playerIds: ReadonlyArray<string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  const used = new Set<number>();
  const playerIdSet = new Set(playerIds);

  const assignFromSource = (source: Record<string, number> | undefined) => {
    if (!source) return;
    for (const [pid, raw] of Object.entries(source)) {
      if (!playerIdSet.has(pid)) continue;
      if (Object.prototype.hasOwnProperty.call(out, pid)) continue;
      const normalized = normalizeDisplayIndex(raw);
      if (normalized == null) continue;
      out[pid] = normalized;
      used.add(normalized);
    }
  };

  assignFromSource(rosterDisplayOrder);
  assignFromSource(stateDisplayOrder);

  let nextIndex = 0;
  for (const pid of playerIds) {
    if (Object.prototype.hasOwnProperty.call(out, pid)) continue;
    while (used.has(nextIndex)) nextIndex++;
    out[pid] = nextIndex;
    used.add(nextIndex);
  }
  return out;
}

function deriveRosterSnapshot(
  state: AppState,
  mode: 'scorecard' | 'single-player',
): RosterSnapshot | null {
  const rosterId =
    mode === 'single-player' ? state.activeSingleRosterId : state.activeScorecardRosterId;
  const roster = rosterId ? state.rosters?.[rosterId] : undefined;
  const basePlayersById = roster?.playersById ?? state.players ?? {};
  const playersById: Record<string, string> = {};

  for (const [pid, name] of Object.entries(basePlayersById)) {
    const normalizedId = typeof pid === 'string' ? pid.trim() : '';
    if (!normalizedId) continue;
    const label =
      typeof name === 'string' && name.trim()
        ? name.trim()
        : (state.players?.[normalizedId] ?? normalizedId);
    playersById[normalizedId] = label;
  }

  const playerIds = Object.keys(playersById);
  if (playerIds.length === 0) {
    return null;
  }

  const playerTypesById = derivePlayerTypesById(state, roster?.playerTypesById, playerIds);
  const displayOrder = deriveDisplayOrderFromSources(
    roster?.displayOrder,
    state.display_order,
    playerIds,
  );

  return {
    rosterId: rosterId ?? null,
    playersById,
    playerTypesById,
    displayOrder,
  };
}

function deriveSlotMapping(
  playersById: Record<string, string>,
  displayOrder: Record<string, number>,
): SummarySlotMapping | null {
  const aliasToId: Record<string, string> = {};
  const addAlias = (alias: unknown, playerId: string) => {
    const normalized = normalizeAlias(alias);
    if (!normalized) return;
    if (Object.prototype.hasOwnProperty.call(aliasToId, normalized)) return;
    aliasToId[normalized] = playerId;
  };

  for (const [pid, name] of Object.entries(playersById)) {
    addAlias(pid, pid);
    addAlias(name, pid);
  }

  for (const [pid, rawIndex] of Object.entries(displayOrder)) {
    const normalizedIndex = normalizeDisplayIndex(rawIndex);
    if (normalizedIndex == null) continue;
    const slot = normalizedIndex + 1;
    addAlias(`player ${slot}`, pid);
    addAlias(`player${slot}`, pid);
    addAlias(`p${slot}`, pid);
  }

  return Object.keys(aliasToId).length ? { aliasToId } : null;
}

function countDistinctPlayers(playersById: Record<string, string>): number {
  // Games can accumulate duplicate player IDs that share the same display name when rosters are
  // rebuilt. Use the display label as the canonical key so the count matches what users see.
  const unique = new Set<string>();
  let fallbackCount = 0;
  for (const [pid, rawName] of Object.entries(playersById)) {
    const normalizedId = typeof pid === 'string' ? pid.trim() : '';
    if (!normalizedId) continue;
    fallbackCount += 1;
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (name) {
      unique.add(name.toLocaleLowerCase());
    } else {
      unique.add(`id:${normalizedId}`);
    }
  }
  return unique.size > 0 ? unique.size : fallbackCount;
}

export type GameRecord = {
  id: string;
  title: string;
  createdAt: number;
  finishedAt: number;
  lastSeq: number;
  archived: boolean;
  archivedAt: number | null;
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
      roundTallies?: Record<number, Record<string, number>>;
    };
    completed?: boolean;
    metadata?: SummaryMetadata;
    rosterSnapshot?: RosterSnapshot | null;
    slotMapping?: SummarySlotMapping | null;
    id?: string;
    startedAt?: number | null;
    updatedAt?: number | null;
    summaryEnteredAt?: number | null;
    roundsCompleted?: number | null;
    finalScores?: ReadonlyArray<Readonly<{ playerId: string; score: number }>>;
    durationMs?: number | null;
    version?: number;
  };
  bundle: ExportBundle;
};

export function resolveSummaryPlayerCount(summary: GameRecord['summary']): number {
  const playersById = summary.rosterSnapshot?.playersById ?? summary.playersById ?? {};
  return countDistinctPlayers(playersById);
}

export function resolveGamePlayerCount(game: GameRecord): number {
  return resolveSummaryPlayerCount(game.summary);
}

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

async function clearSinglePlayerSnapshot(dbName: string) {
  try {
    const db = await openDB(dbName);
    try {
      await clearSnapshot({
        adapters: {
          indexedDb: createIndexedDbAdapter(db),
          localStorage: createLocalStorageAdapter(),
        },
      });
    } finally {
      db.close();
    }
  } catch (error) {
    let reason: string | undefined;
    if (error instanceof Error) {
      reason = error.message;
    } else if (typeof error === 'string') {
      reason = error;
    }
    try {
      captureBrowserMessage('single-player.persist.failed', {
        level: 'warn',
        attributes: {
          code: 'sp.snapshot.clear.failed',
          db: dbName,
          reason,
        },
      });
    } catch {}
  }
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

export function summarizeState(s: AppState): GameRecord['summary'] {
  const scores: Record<string, number> = {};
  for (const [pid, rawScore] of Object.entries(s.scores ?? {})) {
    const normalizedId = typeof pid === 'string' ? pid.trim() : '';
    if (!normalizedId) continue;
    const numericScore = typeof rawScore === 'number' ? rawScore : Number(rawScore);
    scores[normalizedId] = Number.isFinite(numericScore) ? numericScore : 0;
  }

  const playersById: Record<string, string> = {};
  for (const [pid, name] of Object.entries(s.players ?? {})) {
    const normalizedId = typeof pid === 'string' ? pid.trim() : '';
    if (!normalizedId) continue;
    const label = typeof name === 'string' && name.trim() ? name.trim() : normalizedId;
    playersById[normalizedId] = label;
  }
  for (const pid of Object.keys(scores)) {
    if (!Object.prototype.hasOwnProperty.call(playersById, pid)) {
      playersById[pid] = pid;
    }
  }

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
  const completed = selectIsGameComplete(s);

  const rosterSnapshot = deriveRosterSnapshot(s, mode);
  if (rosterSnapshot) {
    for (const [pid, name] of Object.entries(rosterSnapshot.playersById)) {
      if (!Object.prototype.hasOwnProperty.call(playersById, pid) || !playersById[pid]) {
        playersById[pid] = name;
      }
    }
  }
  const playerIds = Object.keys(playersById);
  const resolvedRosterSnapshot =
    rosterSnapshot ??
    (playerIds.length
      ? {
          rosterId: null,
          playersById: { ...playersById },
          playerTypesById: derivePlayerTypesById(s, undefined, playerIds),
          displayOrder: deriveDisplayOrderFromSources(undefined, s.display_order, playerIds),
        }
      : null);
  const slotMapping = resolvedRosterSnapshot
    ? deriveSlotMapping(resolvedRosterSnapshot.playersById, resolvedRosterSnapshot.displayOrder)
    : deriveSlotMapping(
        playersById,
        deriveDisplayOrderFromSources(undefined, s.display_order, playerIds),
      );

  const winnerName =
    winnerId && Object.prototype.hasOwnProperty.call(playersById, winnerId)
      ? (playersById[winnerId] ?? null)
      : null;
  const summaryPlayersById = resolvedRosterSnapshot?.playersById ?? playersById;
  const players = countDistinctPlayers(summaryPlayersById);

  return {
    players,
    scores,
    playersById,
    winnerId,
    winnerName,
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
    completed,
    metadata: {
      version: SUMMARY_METADATA_VERSION,
      generatedAt: Date.now(),
    },
    rosterSnapshot: resolvedRosterSnapshot,
    slotMapping,
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
        // Normalize game records to include archived properties for backward compatibility
        const normalized = out.map((game) => ({
          ...game,
          archived: game.archived ?? false,
          archivedAt: game.archivedAt ?? null,
        }));
        const filtered = normalized.filter((game) => !game.archived);
        filtered.sort((a, b) => b.createdAt - a.createdAt);
        span?.setAttribute('games.count', filtered.length);
        span?.setAttribute('index.used', useIndex);
        return filtered;
      } finally {
        db.close();
      }
    },
    { runtime: 'browser' },
  );
}

export async function listArchivedGames(
  gamesDbName: string = GAMES_DB_NAME,
): Promise<GameRecord[]> {
  return withSpan(
    'state.games-list-archived',
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
          cursorReq.onerror = () => rej(asError(cursorReq.error, 'Failed listing archived games'));
        });
        // Normalize game records to include archived properties for backward compatibility
        const normalized = out.map((game) => ({
          ...game,
          archived: game.archived ?? false,
          archivedAt: game.archivedAt ?? null,
        }));
        const filtered = normalized.filter((game) => game.archived);
        filtered.sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
        span?.setAttribute('games.archived.count', filtered.length);
        span?.setAttribute('index.used', useIndex);
        return filtered;
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
        // Normalize game record to include archived properties for backward compatibility
        const normalized = rec
          ? {
              ...rec,
              archived: rec.archived ?? false,
              archivedAt: rec.archivedAt ?? null,
            }
          : null;
        const resolved = normalized && !normalized.archived ? normalized : null;
        span?.setAttribute('game.found', !!resolved);
        if (normalized?.archived) {
          span?.setAttribute('game.archived', true);
        }
        return resolved;
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
    async (span) => {
      const db = await openDB(gamesDbName);
      try {
        const writeTx = tx(db, 'readwrite', [storeNames.GAMES]);
        const writeStore = writeTx.objectStore(storeNames.GAMES);
        const txDone = new Promise<void>((res, rej) => {
          writeTx.oncomplete = () => res();
          writeTx.onabort = () =>
            rej(asError(writeTx.error, 'Transaction aborted soft deleting game record'));
          writeTx.onerror = () =>
            rej(asError(writeTx.error, 'Transaction error soft deleting game record'));
        });
        const rec = await new Promise<GameRecord | null>((res, rej) => {
          const getReq = writeStore.get(id);
          getReq.onsuccess = () => res((getReq.result as GameRecord | null) ?? null);
          getReq.onerror = () => rej(asError(getReq.error, 'Failed to load game record'));
        });
        if (!rec) {
          span?.setAttribute('game.deleted', false);
          await txDone.catch(() => {});
          return;
        }
        if (rec.archived) {
          span?.setAttribute('game.archived', true);
          span?.setAttribute('game.soft', true);
          await txDone;
          return;
        }
        const putReq = writeStore.put({
          ...rec,
          archived: true,
          archivedAt: Date.now(),
        });
        await new Promise<void>((res, rej) => {
          putReq.onsuccess = () => res();
          putReq.onerror = () => rej(asError(putReq.error, 'Failed to archive game record'));
        });
        await txDone;
        span?.setAttribute('game.archived', true);
        span?.setAttribute('game.archivedAt', Date.now());
        emitGamesSignal({ type: 'deleted', gameId: id });
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
        await clearSinglePlayerSnapshot(dbName);
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
        deletedAt: null,
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

      emitGamesSignal({ type: 'added', gameId: id });

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

      await clearSinglePlayerSnapshot(dbName);

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

export function deriveGameRoute(game: GameRecord): string {
  const mode = deriveGameMode(game);
  return mode === 'single-player' ? singlePlayerPath(game.id) : scorecardPath(game.id, 'live');
}

export function isGameRecordCompleted(game: GameRecord): boolean {
  if (!game) return false;
  if (typeof game.summary?.completed === 'boolean') return game.summary.completed;
  try {
    const state = reduceBundle(game.bundle);
    return selectIsGameComplete(state);
  } catch {
    return false;
  }
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
      if (isGameRecordCompleted(rec)) {
        span?.setAttribute('restored', false);
        span?.setAttribute('restore.blocked', 'completed');
        const error = new Error('Completed games cannot be restored.');
        try {
          (error as { code?: string }).code = 'restore.completed';
          error.name = 'CompletedGameRestoreError';
        } catch {}
        throw error;
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
