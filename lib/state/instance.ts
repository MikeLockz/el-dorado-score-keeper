import { openDB, storeNames, tx } from './db';
import { AppEvent, AppState, INITIAL_STATE, reduce, type UUID } from './types';
import { validateEventStrict } from './validation';
import {
  createIndexedDbAdapter,
  createLocalStorageAdapter,
  persistSpSnapshot,
  type PersistSpSnapshotResult,
} from './persistence/sp-snapshot';
import {
  rehydrateSinglePlayerFromSnapshot,
  type RehydrateSinglePlayerResult,
} from './persistence/sp-rehydrate';
import { ensureSinglePlayerGameIdentifiers } from './utils';
import { uuid } from '@/lib/utils';
import { captureBrowserMessage, trackBrowserEvent } from '@/lib/observability/browser';
import type { SpanAttributesInput } from '@/lib/observability/spans';

export type RouteHydrationContext = Readonly<{
  mode: 'single-player' | 'scorecard' | null;
  gameId: string | null;
  scorecardId: string | null;
}>;

const DEFAULT_ROUTE_CONTEXT: RouteHydrationContext = Object.freeze({
  mode: null,
  gameId: null,
  scorecardId: null,
});

function normalizeRouteContext(
  ctx?: RouteHydrationContext | null,
  fallbackSpGameId?: string | null,
): RouteHydrationContext {
  if (ctx) {
    const mode = ctx.mode ?? null;
    const gameId = typeof ctx.gameId === 'string' && ctx.gameId.trim() ? ctx.gameId.trim() : null;
    const scorecardId =
      typeof ctx.scorecardId === 'string' && ctx.scorecardId.trim() ? ctx.scorecardId.trim() : null;
    if (mode === 'single-player') {
      return { mode, gameId, scorecardId: null };
    }
    if (mode === 'scorecard') {
      return { mode, gameId: null, scorecardId };
    }
    return DEFAULT_ROUTE_CONTEXT;
  }
  const fallback =
    typeof fallbackSpGameId === 'string' && fallbackSpGameId.trim()
      ? fallbackSpGameId.trim()
      : null;
  if (fallback) {
    return { mode: 'single-player', gameId: fallback, scorecardId: null };
  }
  return DEFAULT_ROUTE_CONTEXT;
}

export type Instance = {
  append: (event: AppEvent) => Promise<number>;
  appendMany: (events: AppEvent[]) => Promise<number>;
  getState: () => AppState;
  getHeight: () => number;
  getHydrationEpoch: () => number;
  isHydrating: () => boolean;
  rehydrate: (options?: {
    routeContext?: RouteHydrationContext | null;
    spGameId?: string | null;
    allowLocalFallback?: boolean;
  }) => Promise<void>;
  subscribeHydration: (
    cb: (event: { epoch: number; status: 'start' | 'end' }) => void,
  ) => () => void;
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
  routeContext?: RouteHydrationContext | null;
  spGameId?: string | null;
  allowSpLocalFallback?: boolean;
}): Promise<Instance> {
  const dbName = opts?.dbName ?? 'app-db';
  const chanName = opts?.channelName ?? 'app-events';
  const useChannel = opts?.useChannel !== false;
  const onWarn = opts?.onWarn;
  let currentRouteContext = normalizeRouteContext(opts?.routeContext, opts?.spGameId ?? null);
  let targetSpGameId =
    currentRouteContext.mode === 'single-player' ? currentRouteContext.gameId : null;
  const allowSpLocalFallback = opts?.allowSpLocalFallback !== false;
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

  let hydrationEpoch = 0;
  let hydrationInFlight = false;
  type HydrationListener = (event: { epoch: number; status: 'start' | 'end' }) => void;
  const hydrationListeners = new Set<HydrationListener>();
  const emitHydration = (event: { epoch: number; status: 'start' | 'end' }) => {
    for (const listener of hydrationListeners) {
      try {
        listener(event);
      } catch {}
    }
  };
  let memoryState: AppState = INITIAL_STATE;
  let height = 0;
  let isClosed = false;
  const listeners = new Set<(s: AppState, h: number) => void>();
  const notify = () => {
    for (const l of listeners) l(memoryState, height);
  };
  const localSnapshotAdapter = createLocalStorageAdapter();
  function logSnapshotWarning(code: string, info: unknown, currentHeight: number) {
    const attributes: SpanAttributesInput = { code, height: currentHeight };
    if (info instanceof Error) {
      attributes.reason = info.message;
      attributes.errorName = info.name;
    } else if (typeof info === 'string') {
      const trimmed = info.trim();
      if (trimmed) attributes.reason = trimmed.slice(0, 200);
    } else if (info && typeof info === 'object') {
      let assigned = false;
      for (const [key, value] of Object.entries(info as Record<string, unknown>)) {
        if (attributes[key] !== undefined || value == null) continue;
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (!trimmed) continue;
          attributes[key] = trimmed.slice(0, 200);
          assigned = true;
          continue;
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
          attributes[key] = value;
          assigned = true;
          continue;
        }
        if (typeof value === 'boolean') {
          attributes[key] = value;
          assigned = true;
        }
      }
      if (!assigned) {
        try {
          const serialized = JSON.stringify(info);
          if (serialized) attributes.detail = serialized.slice(0, 500);
        } catch {}
      }
    }
    try {
      captureBrowserMessage('single-player.persist.failed', {
        level: 'warn',
        attributes,
      });
    } catch {}
  }

  const readTimer = () =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const SNAPSHOT_WARNING_DEBOUNCE_MS = 60_000;
  const SNAPSHOT_FAILURE_THRESHOLD = 3;
  let consecutiveSnapshotFailures = 0;
  let lastRepeatedSnapshotWarningAt = 0;
  const quotaWarningAt: Record<'indexed-db' | 'local-storage', number> = {
    'indexed-db': 0,
    'local-storage': 0,
  };

  const isQuotaError = (error: unknown): boolean => {
    if (!error) return false;
    if (error instanceof DOMException) {
      if (
        error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        error.code === 22 ||
        error.code === 1014
      ) {
        return true;
      }
    }
    const name =
      typeof (error as { name?: unknown }).name === 'string'
        ? String((error as { name?: unknown }).name)
        : null;
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return true;
    }
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : typeof (error as { message?: unknown }).message === 'string'
            ? String((error as { message?: unknown }).message)
            : null;
    if (message && /quota/i.test(message)) return true;
    return false;
  };

  async function emitQuotaDiagnostics(
    target: 'indexed-db' | 'local-storage',
    currentHeight: number,
    sourceError: unknown,
  ) {
    const nowTs = Date.now();
    if (nowTs - quotaWarningAt[target] < SNAPSHOT_WARNING_DEBOUNCE_MS) return;
    quotaWarningAt[target] = nowTs;
    let usage: number | undefined;
    let quota: number | undefined;
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        if (typeof estimate?.usage === 'number' && Number.isFinite(estimate.usage)) {
          usage = estimate.usage;
        }
        if (typeof estimate?.quota === 'number' && Number.isFinite(estimate.quota)) {
          quota = estimate.quota;
        }
      } catch {}
    }
    const ratio =
      typeof usage === 'number' && typeof quota === 'number' && quota > 0
        ? Number((usage / quota).toFixed(3))
        : undefined;
    const info: Record<string, unknown> = {
      target,
      usageBytes: usage,
      quotaBytes: quota,
      usageRatio: ratio,
    };
    if (sourceError instanceof Error) {
      info.reason = sourceError.message;
      info.errorName = sourceError.name;
    } else if (typeof sourceError === 'string') {
      info.reason = sourceError;
    }
    logSnapshotWarning('sp.snapshot.persist.quota_exceeded', info, currentHeight);
    trackBrowserEvent('single-player.persist.quota', {
      adapter: target,
      usage_bytes: usage,
      quota_bytes: quota,
      usage_ratio: ratio,
      height: currentHeight,
    });
  }

  async function handleSnapshotOutcome(
    currentHeight: number,
    outcome: { result: PersistSpSnapshotResult | null; durationMs: number; error: unknown },
  ) {
    const { result, durationMs, error } = outcome;
    const snapshot = result?.snapshot ?? null;
    const indexedDbFailed = result?.errors?.some((entry) => entry.target === 'indexed-db') ?? false;
    const localStorageFailed =
      result?.errors?.some((entry) => entry.target === 'local-storage') ?? false;
    const errorCount = (result?.errors?.length ?? 0) + (error ? 1 : 0);
    const hadErrors = indexedDbFailed || localStorageFailed || Boolean(error);
    if (hadErrors) {
      consecutiveSnapshotFailures = Math.min(consecutiveSnapshotFailures + 1, 50);
    } else {
      consecutiveSnapshotFailures = 0;
    }
    const roundedDuration = Number.isFinite(durationMs)
      ? Number(Math.max(0, durationMs).toFixed(2))
      : 0;
    const metrics: SpanAttributesInput = {
      height: result?.height ?? currentHeight,
      duration_ms: roundedDuration,
      persisted: Boolean(result?.persisted),
      skipped_reason: result?.skippedReason,
      adapter_indexed_db_error: indexedDbFailed,
      adapter_local_storage_error: localStorageFailed,
      error_count: errorCount,
      failure_streak: consecutiveSnapshotFailures,
    };
    if (snapshot?.gameId) metrics.game_id = snapshot.gameId;
    if (snapshot?.savedAt) metrics.saved_at = snapshot.savedAt;
    trackBrowserEvent('single-player.persist.snapshot', metrics);

    if (!hadErrors) {
      return;
    }

    if (indexedDbFailed) {
      for (const entry of result?.errors ?? []) {
        if (entry.target === 'indexed-db' && isQuotaError(entry.error)) {
          await emitQuotaDiagnostics('indexed-db', result?.height ?? currentHeight, entry.error);
        }
      }
    }
    if (localStorageFailed) {
      for (const entry of result?.errors ?? []) {
        if (entry.target === 'local-storage' && isQuotaError(entry.error)) {
          await emitQuotaDiagnostics('local-storage', result?.height ?? currentHeight, entry.error);
        }
      }
    }
    if (error && isQuotaError(error)) {
      await emitQuotaDiagnostics('indexed-db', result?.height ?? currentHeight, error);
    }

    const nowTs = Date.now();
    if (
      consecutiveSnapshotFailures >= SNAPSHOT_FAILURE_THRESHOLD &&
      nowTs - lastRepeatedSnapshotWarningAt >= SNAPSHOT_WARNING_DEBOUNCE_MS
    ) {
      lastRepeatedSnapshotWarningAt = nowTs;
      logSnapshotWarning(
        'sp.snapshot.persist.repeated_failures',
        {
          streak: consecutiveSnapshotFailures,
          indexedDbFailed,
          localStorageFailed,
        },
        result?.height ?? currentHeight,
      );
      trackBrowserEvent('single-player.persist.degraded', {
        height: result?.height ?? currentHeight,
        failure_streak: consecutiveSnapshotFailures,
        indexed_db_failed: indexedDbFailed,
        local_storage_failed: localStorageFailed,
      });
    }
  }
  async function persistSinglePlayerSnapshot(state: AppState | null, currentHeight: number) {
    if (isClosed) return;
    const started = readTimer();
    let result: PersistSpSnapshotResult | null = null;
    let thrown: unknown = null;
    try {
      result = await persistSpSnapshot(state, currentHeight, {
        adapters: {
          indexedDb: createIndexedDbAdapter(db),
          localStorage: localSnapshotAdapter,
        },
        onWarn: (code, info) => logSnapshotWarning(code, info, currentHeight),
      });
    } catch (error) {
      thrown = error;
      logSnapshotWarning('sp.snapshot.persist.unhandled_exception', error, currentHeight);
    }
    const duration = Math.max(0, readTimer() - started);
    await handleSnapshotOutcome(currentHeight, { result, durationMs: duration, error: thrown });
  }
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
      Pick<AppState, 'rosters' | 'activeScorecardRosterId' | 'activeSingleRosterId' | 'humanByMode'>
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
    const hadLegacyPlayers = next.players && Object.keys(next.players).length > 0;
    if (!Object.keys(next.rosters ?? {}).length && hadLegacyPlayers) {
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
      const playerTypesById: Record<string, 'human' | 'bot'> = {};
      for (const pid of Object.keys(playersById)) {
        playerTypesById[pid] = next.playerDetails?.[pid]?.type ?? 'human';
      }
      const roster = {
        name: 'Score Card',
        playersById,
        playerTypesById,
        displayOrder,
        type: 'scorecard' as const,
        createdAt,
        archivedAt: null,
      };
      const newRosters: AppState['rosters'] = { [rid]: roster };
      next = Object.assign({}, next, { rosters: newRosters, activeScorecardRosterId: rid });
    }
    const defaultRosterId = 'scorecard-default';
    if (
      Object.prototype.hasOwnProperty.call(next.rosters, defaultRosterId) &&
      next.rosters[defaultRosterId]
    ) {
      const legacyRoster = next.rosters[defaultRosterId]!;
      const replacementId: UUID = uuid();
      const updatedRosters: AppState['rosters'] = Object.assign({}, next.rosters);
      delete updatedRosters[defaultRosterId];
      updatedRosters[replacementId] = legacyRoster;
      const activeScorecardRosterId =
        next.activeScorecardRosterId === defaultRosterId
          ? replacementId
          : next.activeScorecardRosterId;
      next = Object.assign({}, next, {
        rosters: updatedRosters,
        activeScorecardRosterId,
      });
    }

    const rosterEntries = Object.entries(next.rosters ?? {});
    const hasAnyRoster = rosterEntries.length > 0;
    const hasLegacyPlayers = hadLegacyPlayers;
    const scorecardEntries = rosterEntries.filter(
      (entry): entry is [UUID, NonNullable<AppState['rosters'][UUID]>] =>
        !!entry[1] && entry[1].type === 'scorecard',
    );

    if (scorecardEntries.length === 0) {
      const shouldCreateFallback = hasAnyRoster || hasLegacyPlayers;
      if (shouldCreateFallback) {
        const rid: UUID = uuid();
        const roster = {
          name: 'Score Card',
          playersById: {} as Record<string, string>,
          playerTypesById: {} as Record<string, 'human' | 'bot'>,
          displayOrder: {} as Record<string, number>,
          type: 'scorecard' as const,
          createdAt: Date.now(),
          archivedAt: null,
        };
        next = Object.assign({}, next, {
          rosters: Object.assign({}, next.rosters, { [rid]: roster }),
          activeScorecardRosterId: rid,
        });
      } else {
        next = Object.assign({}, next, { activeScorecardRosterId: null });
      }
    } else {
      const activeId = next.activeScorecardRosterId;
      const hasActive =
        typeof activeId === 'string' &&
        scorecardEntries.some(([rid]) => rid === activeId && next.rosters[rid]);
      if (!hasActive) {
        const unarchived = scorecardEntries.find(([, roster]) => !roster.archivedAt);
        const fallback = unarchived ?? scorecardEntries[0];
        if (fallback) {
          next = Object.assign({}, next, { activeScorecardRosterId: fallback[0] });
        }
      }
    }

    return ensureSinglePlayerGameIdentifiers(next);
  }

  async function attemptSinglePlayerRehydrate(
    gameId: string | null,
    allowLocalFallback: boolean,
  ): Promise<RehydrateSinglePlayerResult | null> {
    const target = typeof gameId === 'string' && gameId.trim() ? gameId.trim() : null;
    if (!target) return null;
    const started = readTimer();
    try {
      const result = await rehydrateSinglePlayerFromSnapshot({
        gameId: target,
        adapters: {
          indexedDb: createIndexedDbAdapter(db),
          localStorage: localSnapshotAdapter,
        },
        baseState: upgradeState(INITIAL_STATE),
        allowLocalStorageFallback: allowLocalFallback,
        onWarn: (code, info) => logSnapshotWarning(code, info, height),
      });
      const durationMs = Number(Math.max(0, readTimer() - started).toFixed(2));
      const metrics: SpanAttributesInput = {
        game_id: target,
        height: result.height,
        applied: result.applied,
        source: result.source ?? 'none',
        duration_ms: durationMs,
        allow_fallback: allowLocalFallback,
        fallback_used: result.source === 'local-storage',
      };
      if (result.reason) metrics.reason = result.reason;
      if (result.entry?.savedAt) metrics.saved_at = result.entry.savedAt;
      trackBrowserEvent('single-player.persist.rehydrate', metrics);
      if (result.source === 'local-storage') {
        captureBrowserMessage('single-player.persist.fallback', {
          level: result.applied ? 'info' : 'warn',
          attributes: {
            code: 'sp.snapshot.rehydrate.fallback',
            gameId: target,
            height: result.height,
            applied: result.applied,
            savedAt: result.entry?.savedAt ?? result.snapshot?.savedAt,
            allowFallback: allowLocalFallback,
          },
        });
        trackBrowserEvent('single-player.persist.fallback', {
          game_id: target,
          height: result.height,
          adapter: 'local-storage',
          applied: result.applied,
          duration_ms: durationMs,
        });
      }
      if (!result.applied || !result.state) {
        if (result.reason) {
          logSnapshotWarning(
            'sp.snapshot.rehydrate.unapplied',
            { gameId: target, reason: result.reason },
            height,
          );
        }
        return result;
      }
      memoryState = result.state;
      height = result.height;
      devLog('rehydrate.sp_snapshot_applied', {
        gameId: target,
        source: result.source,
        height: result.height,
      });
      return result;
    } catch (error) {
      const durationMs = Number(Math.max(0, readTimer() - started).toFixed(2));
      trackBrowserEvent('single-player.persist.rehydrate', {
        game_id: target,
        height,
        applied: false,
        source: 'exception',
        duration_ms: durationMs,
        allow_fallback: allowLocalFallback,
        failure: true,
      });
      logSnapshotWarning('sp.snapshot.rehydrate.unhandled_exception', error, height);
      return null;
    }
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
    await persistSinglePlayerSnapshot(memoryState, height);
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

  async function rehydrate(options?: {
    routeContext?: RouteHydrationContext | null;
    spGameId?: string | null;
    allowLocalFallback?: boolean;
  }) {
    const nextEpoch = hydrationEpoch + 1;
    hydrationInFlight = true;
    emitHydration({ epoch: nextEpoch, status: 'start' });
    try {
      if (options) {
        if (Object.prototype.hasOwnProperty.call(options, 'routeContext')) {
          currentRouteContext = normalizeRouteContext(
            options?.routeContext ?? null,
            options?.spGameId,
          );
        } else if (Object.prototype.hasOwnProperty.call(options, 'spGameId')) {
          currentRouteContext = normalizeRouteContext(
            currentRouteContext,
            options?.spGameId ?? null,
          );
        }
      }
      targetSpGameId =
        currentRouteContext.mode === 'single-player' ? currentRouteContext.gameId : null;
      const allowFallback = options?.allowLocalFallback ?? allowSpLocalFallback;
      await initSnapshotStrategy();
      let spResult: RehydrateSinglePlayerResult | null = null;
      if (targetSpGameId) {
        spResult = await attemptSinglePlayerRehydrate(targetSpGameId, allowFallback);
        if (!spResult?.applied) {
          warn('single-player.snapshot.unavailable', {
            gameId: targetSpGameId,
            reason: spResult?.reason ?? 'unknown',
            source: spResult?.source ?? null,
          });
        }
      }
      if (!spResult?.applied) {
        await loadCurrent();
      }
      await applyTail(height);
      // Ensure any missing roster scaffolding is bootstrapped before persisting
      memoryState = upgradeState(memoryState);
      await persistCurrent();
      notify();
      hydrationEpoch = nextEpoch;
    } catch (error) {
      hydrationInFlight = false;
      emitHydration({ epoch: hydrationEpoch, status: 'end' });
      throw error;
    }
    hydrationInFlight = false;
    emitHydration({ epoch: hydrationEpoch, status: 'end' });
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
      await persistSinglePlayerSnapshot(memoryState, height);
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
      await persistSinglePlayerSnapshot(memoryState, height);
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
  function getHydrationEpoch() {
    return hydrationEpoch;
  }
  function isHydrating() {
    return hydrationInFlight;
  }
  function close() {
    isClosed = true;
    try {
      chan?.close();
    } catch {}
    hydrationListeners.clear();
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
  function subscribeHydration(
    cb: (event: { epoch: number; status: 'start' | 'end' }) => void,
  ): () => void {
    hydrationListeners.add(cb);
    return () => {
      hydrationListeners.delete(cb);
    };
  }

  return {
    append,
    appendMany,
    getState,
    getHeight,
    getHydrationEpoch,
    isHydrating,
    rehydrate,
    subscribeHydration,
    close,
    subscribe,
    setTestAppendFailure,
    setTestAbortAfterAddOnce,
  } as Instance & {
    setTestAppendFailure: typeof setTestAppendFailure;
    setTestAbortAfterAddOnce: typeof setTestAbortAfterAddOnce;
  };
}
