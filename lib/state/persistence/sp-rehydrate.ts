import { INITIAL_STATE, type AppState, type PlayerDetail } from '../types';
import { openDB } from '../db';
import {
  createIndexedDbAdapter,
  createLocalStorageAdapter,
  clearSnapshot,
  type SnapshotPersistenceAdapters,
  type SinglePlayerSnapshotV1,
  type SpGameIndexEntry,
  loadSnapshotByGameId,
  type LoadSnapshotByGameIdResult,
} from './sp-snapshot';

export type RehydrateSinglePlayerOptions = {
  gameId: string;
  adapters: SnapshotPersistenceAdapters;
  baseState?: AppState;
  allowLocalStorageFallback?: boolean;
  onWarn?: (code: string, info?: unknown) => void;
};

export type RehydrateSinglePlayerResult = {
  applied: boolean;
  state: AppState | null;
  height: number;
  source: 'indexed-db' | 'local-storage' | null;
  snapshot: SinglePlayerSnapshotV1 | null;
  entry: SpGameIndexEntry | null;
  reason?: 'game-id-missing' | 'game-index-missing' | 'snapshot-missing';
};

const DEFAULT_ROSTER_NAME = 'Single Player';

function clonePlain<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {}
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function applySnapshotToState(base: AppState, snapshot: SinglePlayerSnapshotV1): AppState {
  const roster = snapshot.roster;
  const baseHuman = base.humanByMode ?? {};
  const now = snapshot.savedAt ?? Date.now();

  const players: AppState['players'] = { ...base.players };
  const playerDetails: Record<string, PlayerDetail> = { ...base.playerDetails };
  const displayOrder: AppState['display_order'] = { ...base.display_order };
  const rosters: AppState['rosters'] = { ...base.rosters };
  let activeSingleRosterId = base.activeSingleRosterId;

  if (roster && Object.keys(roster.playersById ?? {}).length > 0) {
    for (const [playerId, name] of Object.entries(roster.playersById)) {
      if (!playerId || typeof name !== 'string') continue;
      players[playerId] = name;
      const playerType = roster.playerTypesById?.[playerId] === 'bot' ? 'bot' : 'human';
      playerDetails[playerId] = {
        name,
        type: playerType,
        archived: false,
        archivedAt: null,
        createdAt: playerDetails[playerId]?.createdAt ?? now,
        updatedAt: now,
      };
    }
    for (const [pid, order] of Object.entries(roster.displayOrder ?? {})) {
      if (typeof order === 'number' && Number.isFinite(order)) {
        displayOrder[pid] = order;
      }
    }
    if (snapshot.rosterId) {
      rosters[snapshot.rosterId] = {
        name: rosters[snapshot.rosterId]?.name ?? DEFAULT_ROSTER_NAME,
        playersById: clonePlain(roster.playersById),
        playerTypesById: clonePlain(roster.playerTypesById),
        displayOrder: clonePlain(roster.displayOrder),
        type: 'single',
        createdAt: rosters[snapshot.rosterId]?.createdAt ?? now,
        archivedAt: rosters[snapshot.rosterId]?.archivedAt ?? null,
      };
      activeSingleRosterId = snapshot.rosterId;
    }
  }

  const scores: AppState['scores'] = { ...base.scores, ...snapshot.scores };
  const rounds: AppState['rounds'] = { ...base.rounds, ...clonePlain(snapshot.rounds) };
  const spState = Object.assign({}, clonePlain(snapshot.sp), {
    currentGameId: snapshot.gameId,
    gameId: snapshot.gameId,
  }) as AppState['sp'];

  const next: AppState = {
    players,
    playerDetails,
    scores,
    rounds,
    rosters,
    activeScorecardRosterId: base.activeScorecardRosterId,
    activeSingleRosterId,
    humanByMode: { ...baseHuman, single: snapshot.humanId ?? null },
    sp: spState,
    display_order: displayOrder,
  };

  return next;
}

function resolveLoadResult(
  base: AppState,
  loadResult: LoadSnapshotByGameIdResult,
): RehydrateSinglePlayerResult {
  if (!loadResult.snapshot) {
    return {
      applied: false,
      state: null,
      height: loadResult.entry?.height ?? 0,
      source: loadResult.source,
      snapshot: null,
      entry: loadResult.entry,
      reason: loadResult.entry ? 'snapshot-missing' : 'game-index-missing',
    };
  }

  const nextState = applySnapshotToState(base, loadResult.snapshot);
  return {
    applied: true,
    state: nextState,
    height: loadResult.snapshot.height,
    source: loadResult.source ?? 'indexed-db',
    snapshot: loadResult.snapshot,
    entry: loadResult.entry,
  };
}

export async function rehydrateSinglePlayerFromSnapshot(
  options: RehydrateSinglePlayerOptions,
): Promise<RehydrateSinglePlayerResult> {
  const gameId = typeof options.gameId === 'string' ? options.gameId.trim() : '';
  if (!gameId) {
    return {
      applied: false,
      state: null,
      height: 0,
      source: null,
      snapshot: null,
      entry: null,
      reason: 'game-id-missing',
    };
  }
  const baseState = options.baseState ?? INITIAL_STATE;
  const loadResult = await loadSnapshotByGameId({
    gameId,
    adapters: options.adapters,
    allowLocalStorageFallback: options.allowLocalStorageFallback,
    onWarn: options.onWarn,
  });
  return resolveLoadResult(baseState, loadResult);
}

export function deriveStateFromSnapshot(
  base: AppState,
  snapshot: SinglePlayerSnapshotV1,
): AppState {
  return applySnapshotToState(base, snapshot);
}

export async function clearSinglePlayerSnapshotCache(
  dbName: string = 'app-db',
  storage: Storage | null = typeof window !== 'undefined' ? window.localStorage : null,
): Promise<void> {
  const db = await openDB(dbName);
  try {
    await clearSnapshot({
      adapters: {
        indexedDb: createIndexedDbAdapter(db),
        localStorage: createLocalStorageAdapter(storage),
      },
    });
  } finally {
    db.close();
  }
}
