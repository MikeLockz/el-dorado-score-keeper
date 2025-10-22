'use client';

import { captureBrowserMessage } from '@/lib/observability/browser';
import { openDB, storeNames, tx } from '../db';
import {
  listGames,
  summarizeState,
  SUMMARY_METADATA_VERSION,
  GAMES_DB_NAME,
  type GameRecord,
  getGame,
} from '../io';
import { INITIAL_STATE, reduce, type AppEvent, type AppState } from '../types';

export type HistoricalSummaryBackfillProgress = Readonly<{
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  lastGameId: string | null;
}>;

export type HistoricalSummaryBackfillResult = HistoricalSummaryBackfillProgress & {
  durationMs: number;
};

type MutableHistoricalSummaryBackfillProgress = {
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  lastGameId: string | null;
};

export type BackfillCandidate = Readonly<{
  id: string;
  title: string;
  createdAt: number;
  finishedAt: number;
  metadataVersion: number;
}>;

export type BackfillGameResult = Readonly<{
  id: string;
  updated: boolean;
  previousSummary: GameRecord['summary'];
  summary: GameRecord['summary'];
  record: GameRecord;
}>;

type BackfillEnsureOptions = Readonly<{
  gamesDbName?: string;
  force?: boolean;
  limit?: number;
  onProgress?: (progress: HistoricalSummaryBackfillProgress) => void;
}>;

type CanonicalRosterSnapshot = Readonly<{
  rosterId: string | null;
  playersById: Record<string, string>;
  playerTypesById: Record<string, 'human' | 'bot'>;
  displayOrder: Record<string, number>;
}>;

const aliasDelimiterRegex = /\s+/g;
const truthyFlagValues = new Set(['1', 'true', 'yes', 'on']);
const falsyFlagValues = new Set(['0', 'false', 'no', 'off']);
const BACKFILL_COMPLETION_STORAGE_KEY = 'player-stats.backfill.version';

let inMemoryBackfillVersion: number | null = null;
let pendingBackfillPromise: Promise<HistoricalSummaryBackfillResult> | null = null;

function parseBooleanFlag(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (truthyFlagValues.has(normalized)) return true;
  if (falsyFlagValues.has(normalized)) return false;
  return null;
}

const backfillFeatureFlagEnabled = (() => {
  if (typeof process === 'undefined') return true;
  const raw =
    process.env?.NEXT_PUBLIC_PLAYER_STATS_BACKFILL_ENABLED ??
    process.env?.PLAYER_STATS_BACKFILL_ENABLED ??
    process.env?.NEXT_PUBLIC_ENABLE_PLAYER_STATS_BACKFILL ??
    process.env?.ENABLE_PLAYER_STATS_BACKFILL;
  const parsed = parseBooleanFlag(raw);
  return parsed ?? true;
})();

function readPersistedBackfillVersion(): number | null {
  if (typeof window !== 'undefined' && window?.localStorage) {
    try {
      const raw = window.localStorage.getItem(BACKFILL_COMPLETION_STORAGE_KEY);
      if (raw != null) {
        const parsed = Number.parseInt(raw, 10);
        if (Number.isFinite(parsed)) {
          inMemoryBackfillVersion = parsed;
          return parsed;
        }
      }
    } catch {
      // Ignore storage access failures (e.g., private browsing restrictions)
    }
  }
  return inMemoryBackfillVersion;
}

function persistBackfillVersion(version: number): void {
  inMemoryBackfillVersion = version;
  if (typeof window === 'undefined' || !window?.localStorage) return;
  try {
    window.localStorage.setItem(BACKFILL_COMPLETION_STORAGE_KEY, String(version));
  } catch {
    // Ignore storage access failures
  }
}

function shouldRunBackfill({ force }: BackfillEnsureOptions): boolean {
  if (!force && !backfillFeatureFlagEnabled) {
    return false;
  }
  if (typeof indexedDB === 'undefined') {
    return false;
  }
  if (force) {
    return true;
  }
  const storedVersion = readPersistedBackfillVersion();
  if (storedVersion != null && storedVersion >= SUMMARY_METADATA_VERSION) {
    return false;
  }
  return true;
}

function normalizeAlias(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(aliasDelimiterRegex, ' ').toLocaleLowerCase();
}

function replayBundle(events: ReadonlyArray<AppEvent>): typeof INITIAL_STATE {
  let state = INITIAL_STATE;
  for (const event of events) {
    state = reduce(state, event);
  }
  return state;
}

async function writeGameRecord(db: IDBDatabase, record: GameRecord): Promise<void> {
  const transaction = tx(db, 'readwrite', [storeNames.GAMES]);
  const request = transaction.objectStore(storeNames.GAMES).put(record);
  await new Promise<void>((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(
        request.error instanceof Error
          ? request.error
          : new Error('Failed writing backfilled game record'),
      );
    transaction.onabort = () =>
      reject(
        transaction.error instanceof Error
          ? transaction.error
          : new Error('Transaction aborted while writing backfilled summary'),
      );
    transaction.onerror = () =>
      reject(
        transaction.error instanceof Error
          ? transaction.error
          : new Error('Transaction error while writing backfilled summary'),
      );
  });
}

function deriveCanonicalRosterSnapshot(
  summary: GameRecord['summary'],
  state: AppState,
): CanonicalRosterSnapshot {
  const snapshot = summary.rosterSnapshot;
  if (snapshot && snapshot.playersById && Object.keys(snapshot.playersById).length > 0) {
    const playerTypes: Record<string, 'human' | 'bot'> = {};
    for (const [pid, label] of Object.entries(snapshot.playersById)) {
      if (!pid) continue;
      const detailType = state.playerDetails?.[pid]?.type;
      const snapshotType = snapshot.playerTypesById?.[pid];
      if (detailType === 'human' || detailType === 'bot') {
        playerTypes[pid] = detailType;
      } else if (snapshotType === 'human' || snapshotType === 'bot') {
        playerTypes[pid] = snapshotType;
      } else {
        playerTypes[pid] = 'human';
      }
      if (!label && state.players?.[pid]) {
        snapshot.playersById[pid] = state.players[pid]!;
      }
    }
    return {
      rosterId: snapshot.rosterId ?? null,
      playersById: { ...snapshot.playersById },
      playerTypesById: playerTypes,
      displayOrder: { ...(snapshot.displayOrder ?? {}) },
    };
  }

  const playersById: Record<string, string> = {};
  const playerTypesById: Record<string, 'human' | 'bot'> = {};
  const displayOrder: Record<string, number> = {};

  if (Array.isArray(state.sp?.order)) {
    state.sp.order.forEach((pid, index) => {
      if (typeof pid !== 'string') return;
      const trimmed = pid.trim();
      if (!trimmed || playersById[trimmed]) return;
      playersById[trimmed] = state.players?.[trimmed] ?? trimmed;
      displayOrder[trimmed] = index;
    });
  }

  for (const [pid, name] of Object.entries(state.players ?? {})) {
    if (!pid || playersById[pid]) continue;
    playersById[pid] = name;
  }

  for (const [pid, details] of Object.entries(state.playerDetails ?? {})) {
    if (!pid) continue;
    if ((details?.type === 'human' || details?.type === 'bot') && !playerTypesById[pid]) {
      playerTypesById[pid] = details.type;
    }
    if (!playersById[pid] && details?.name) {
      playersById[pid] = details.name;
    }
  }

  return {
    rosterId: null,
    playersById,
    playerTypesById,
    displayOrder,
  };
}

type AliasResolver = {
  resolve: (rawId: string | null | undefined, hint?: string | null) => string | null;
  buildSlotMapping: () => GameRecord['summary']['slotMapping'];
};

function createAliasResolver(
  snapshot: CanonicalRosterSnapshot,
  summary: GameRecord['summary'],
  state: AppState,
): AliasResolver {
  const canonicalIds = Object.keys(snapshot.playersById);
  const canonicalSet = new Set(canonicalIds);
  const aliasToId = new Map<string, string>();

  const register = (alias: string | null | undefined, canonicalId: string) => {
    if (!alias) return;
    if (!canonicalSet.has(canonicalId)) return;
    const normalized = normalizeAlias(alias);
    if (!normalized) return;
    if (!aliasToId.has(normalized)) {
      aliasToId.set(normalized, canonicalId);
    }
  };

  for (const canonicalId of canonicalIds) {
    register(canonicalId, canonicalId);
    register(snapshot.playersById[canonicalId], canonicalId);
    register(state.players?.[canonicalId], canonicalId);
    register(state.playerDetails?.[canonicalId]?.name, canonicalId);
  }

  const displayEntries = Object.entries(snapshot.displayOrder ?? {});
  if (displayEntries.length > 0) {
    for (const [pid, order] of displayEntries) {
      if (!canonicalSet.has(pid)) continue;
      if (typeof order !== 'number' || !Number.isFinite(order)) continue;
      const slot = order + 1;
      register(`player ${slot}`, pid);
      register(`player${slot}`, pid);
      register(`p${slot}`, pid);
    }
  } else {
    canonicalIds.forEach((pid, index) => {
      const slot = index + 1;
      register(`player ${slot}`, pid);
      register(`player${slot}`, pid);
      register(`p${slot}`, pid);
    });
  }

  if (summary.slotMapping?.aliasToId) {
    for (const [alias, target] of Object.entries(summary.slotMapping.aliasToId)) {
      if (!target) continue;
      if (canonicalSet.has(target)) {
        register(alias, target);
        continue;
      }
      const normalized = normalizeAlias(target);
      if (normalized && aliasToId.has(normalized)) {
        register(alias, aliasToId.get(normalized)!);
      }
    }
  }

  const resolve: AliasResolver['resolve'] = (rawId, hint) => {
    if (!rawId) return null;
    if (canonicalSet.has(rawId)) return rawId;
    const normalizedRaw = normalizeAlias(rawId);
    if (normalizedRaw && aliasToId.has(normalizedRaw)) {
      return aliasToId.get(normalizedRaw) ?? null;
    }
    const normalizedHint = normalizeAlias(hint);
    if (normalizedHint && aliasToId.has(normalizedHint)) {
      const canonical = aliasToId.get(normalizedHint) ?? null;
      if (canonical && normalizedRaw) {
        aliasToId.set(normalizedRaw, canonical);
      }
      return canonical;
    }
    const fallbackName =
      summary.playersById?.[rawId] ??
      state.players?.[rawId] ??
      state.playerDetails?.[rawId]?.name ??
      null;
    const normalizedFallback = normalizeAlias(fallbackName);
    if (normalizedFallback && aliasToId.has(normalizedFallback)) {
      const canonical = aliasToId.get(normalizedFallback) ?? null;
      if (canonical && normalizedRaw) {
        aliasToId.set(normalizedRaw, canonical);
      }
      return canonical;
    }
    return null;
  };

  const buildSlotMapping = () => {
    const aliasMap: Record<string, string> = {};
    for (const [alias, canonical] of aliasToId.entries()) {
      if (!canonicalSet.has(canonical)) continue;
      aliasMap[alias] = canonical;
    }
    return { aliasToId: aliasMap };
  };

  return { resolve, buildSlotMapping };
}

function sortCanonicalIdsByDisplayOrder(
  snapshot: CanonicalRosterSnapshot,
  ids: string[],
): string[] {
  const entries = ids.map((id) => ({
    id,
    order:
      typeof snapshot.displayOrder?.[id] === 'number' &&
      Number.isFinite(snapshot.displayOrder?.[id])
        ? (snapshot.displayOrder?.[id] ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER,
  }));
  entries.sort((a, b) => {
    if (a.order === b.order) return a.id.localeCompare(b.id);
    return a.order - b.order;
  });
  return entries.map((entry) => entry.id);
}

function canonicalizeSummary(
  summary: GameRecord['summary'],
  state: AppState,
): GameRecord['summary'] {
  const snapshot = deriveCanonicalRosterSnapshot(summary, state);
  const canonicalIds = Object.keys(snapshot.playersById);
  if (canonicalIds.length === 0) {
    return {
      ...summary,
      metadata: {
        version: SUMMARY_METADATA_VERSION,
        generatedAt: Date.now(),
      },
      rosterSnapshot: snapshot,
    };
  }
  const canonicalSet = new Set(canonicalIds);
  const resolver = createAliasResolver(snapshot, summary, state);
  const canonicalScores: Record<string, number> = {};
  canonicalIds.forEach((pid) => {
    canonicalScores[pid] = 0;
  });

  for (const [rawId, rawScore] of Object.entries(summary.scores ?? {})) {
    const canonical = resolver.resolve(rawId, summary.playersById?.[rawId]);
    if (!canonical) continue;
    const numeric =
      typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : Number(rawScore);
    if (!Number.isFinite(numeric)) continue;
    canonicalScores[canonical] = (canonicalScores[canonical] ?? 0) + numeric;
  }

  let winnerId: string | null = null;
  let winnerScore: number | null = null;
  for (const pid of canonicalIds) {
    const score = canonicalScores[pid] ?? 0;
    if (winnerScore == null || score > winnerScore) {
      winnerScore = score;
      winnerId = pid;
    }
  }

  const sp = summary.sp
    ? {
        ...summary.sp,
      }
    : undefined;
  if (sp) {
    const mappedOrder: string[] = [];
    const seen = new Set<string>();
    for (const rawId of sp.order ?? []) {
      const canonical = resolver.resolve(rawId, summary.playersById?.[rawId]);
      if (!canonical || seen.has(canonical)) continue;
      seen.add(canonical);
      mappedOrder.push(canonical);
    }
    if (mappedOrder.length === 0) {
      mappedOrder.push(...sortCanonicalIdsByDisplayOrder(snapshot, canonicalIds));
    }
    sp.order = mappedOrder;
    const trickCounts: Record<string, number> = {};
    for (const [rawId, rawCount] of Object.entries(sp.trickCounts ?? {})) {
      const canonical = resolver.resolve(rawId, summary.playersById?.[rawId]);
      if (!canonical) continue;
      const numeric =
        typeof rawCount === 'number' && Number.isFinite(rawCount) ? rawCount : Number(rawCount);
      trickCounts[canonical] = Number.isFinite(numeric) ? numeric : 0;
    }
    sp.trickCounts = trickCounts;
    const resolvedDealer = resolver.resolve(sp.dealerId, summary.playersById?.[sp.dealerId ?? '']);
    sp.dealerId =
      resolvedDealer ??
      (sp.dealerId && canonicalSet.has(sp.dealerId) ? sp.dealerId : (mappedOrder[0] ?? null));
    const resolvedLeader = resolver.resolve(sp.leaderId, summary.playersById?.[sp.leaderId ?? '']);
    sp.leaderId =
      resolvedLeader ??
      (sp.leaderId && canonicalSet.has(sp.leaderId) ? sp.leaderId : (mappedOrder[0] ?? null));
  }

  const slotMapping = resolver.buildSlotMapping();

  const playerTypes: Record<string, 'human' | 'bot'> = { ...snapshot.playerTypesById };
  for (const pid of canonicalIds) {
    if (playerTypes[pid]) continue;
    const detailType = state.playerDetails?.[pid]?.type;
    if (detailType === 'human' || detailType === 'bot') {
      playerTypes[pid] = detailType;
    } else {
      playerTypes[pid] = 'human';
    }
  }

  return {
    ...summary,
    players: canonicalIds.length,
    scores: canonicalScores,
    playersById: { ...snapshot.playersById },
    winnerId,
    winnerName: winnerId ? (snapshot.playersById[winnerId] ?? null) : null,
    winnerScore,
    metadata: {
      version: SUMMARY_METADATA_VERSION,
      generatedAt: Date.now(),
    },
    rosterSnapshot: {
      rosterId: snapshot.rosterId,
      playersById: { ...snapshot.playersById },
      playerTypesById: playerTypes,
      displayOrder: { ...snapshot.displayOrder },
    },
    slotMapping: slotMapping ?? null,
    ...(sp ? { sp } : {}),
  };
}

function toCandidate(game: GameRecord): BackfillCandidate {
  return {
    id: game.id,
    title: game.title,
    createdAt: game.createdAt,
    finishedAt: game.finishedAt,
    metadataVersion: game.summary?.metadata?.version ?? 0,
  };
}

export async function listBackfillCandidates({
  gamesDbName = GAMES_DB_NAME,
}: {
  gamesDbName?: string;
} = {}): Promise<BackfillCandidate[]> {
  const games = await listGames(gamesDbName);
  return games
    .filter((game) => (game.summary?.metadata?.version ?? 0) < SUMMARY_METADATA_VERSION)
    .map(toCandidate)
    .sort((a, b) => b.finishedAt - a.finishedAt);
}

export async function backfillGameById(
  gameId: string,
  { gamesDbName = GAMES_DB_NAME, dryRun = false }: { gamesDbName?: string; dryRun?: boolean } = {},
): Promise<BackfillGameResult | null> {
  if (!gameId) return null;
  const record = await getGame(gamesDbName, gameId);
  if (!record) {
    captureBrowserMessage('player-stats.backfill.not-found', {
      level: 'warn',
      attributes: { gameId },
    });
    return null;
  }

  const previousSummary = record.summary;
  const existingVersion = previousSummary?.metadata?.version ?? 0;
  if (existingVersion >= SUMMARY_METADATA_VERSION) {
    return {
      id: record.id,
      updated: false,
      previousSummary,
      summary: previousSummary,
      record,
    };
  }

  const replayedState = replayBundle(record.bundle?.events ?? []);
  const enrichedSummary = canonicalizeSummary(summarizeState(replayedState), replayedState);

  if (!dryRun) {
    const db = await openDB(gamesDbName);
    try {
      await writeGameRecord(db, {
        ...record,
        summary: enrichedSummary,
      });
    } finally {
      try {
        db.close();
      } catch {
        // ignore close failures
      }
    }
  }

  captureBrowserMessage('player-stats.backfill.single', {
    level: 'info',
    attributes: {
      gameId: record.id,
      previousVersion: existingVersion,
      nextVersion: enrichedSummary.metadata?.version ?? null,
      dryRun,
    },
  });

  return {
    id: record.id,
    updated: !dryRun,
    previousSummary,
    summary: enrichedSummary,
    record: {
      ...record,
      summary: enrichedSummary,
    },
  };
}

export async function runHistoricalSummaryBackfill({
  gamesDbName = GAMES_DB_NAME,
  onProgress,
  limit,
}: {
  gamesDbName?: string;
  onProgress?: (progress: HistoricalSummaryBackfillProgress) => void;
  limit?: number;
} = {}): Promise<HistoricalSummaryBackfillResult> {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const progress: MutableHistoricalSummaryBackfillProgress = {
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    lastGameId: null,
  };

  const candidates = await listBackfillCandidates({ gamesDbName });
  const targets = typeof limit === 'number' ? candidates.slice(0, Math.max(0, limit)) : candidates;

  for (const candidate of targets) {
    progress.processed += 1;
    progress.lastGameId = candidate.id;
    try {
      const result = await backfillGameById(candidate.id, { gamesDbName });
      if (!result) {
        progress.skipped += 1;
      } else if (!result.updated) {
        progress.skipped += 1;
      } else {
        progress.updated += 1;
      }
    } catch (error) {
      progress.failed += 1;
      captureBrowserMessage('player-stats.backfill.failed', {
        level: 'warn',
        attributes: {
          gameId: candidate.id,
          reason:
            error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown',
        },
      });
    }
    onProgress?.({ ...progress });
  }

  const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    ...progress,
    durationMs: Math.max(0, end - start),
  };
}

export async function ensureHistoricalSummariesBackfilled(
  options: BackfillEnsureOptions = {},
): Promise<HistoricalSummaryBackfillResult | null> {
  if (!shouldRunBackfill(options)) {
    return null;
  }

  if (pendingBackfillPromise) {
    return pendingBackfillPromise;
  }

  pendingBackfillPromise = (async () => {
    try {
      const result = await runHistoricalSummaryBackfill({
        gamesDbName: options.gamesDbName ?? GAMES_DB_NAME,
        ...(options.onProgress ? { onProgress: options.onProgress } : {}),
        ...(typeof options.limit === 'number' ? { limit: options.limit } : {}),
      });
      if (result.failed === 0) {
        persistBackfillVersion(SUMMARY_METADATA_VERSION);
      }
      return result;
    } catch (error: unknown) {
      captureBrowserMessage('player-stats.backfill.ensure.error', {
        level: 'warn',
        attributes: {
          reason:
            error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown',
        },
      });
      throw error;
    } finally {
      pendingBackfillPromise = null;
    }
  })();

  return pendingBackfillPromise;
}
