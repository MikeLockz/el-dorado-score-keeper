import { generateGameData, type GeneratedGameOptions } from './gameDataGenerator';
import { openDB, storeNames, tx } from '@/lib/state/db';
import { DEFAULT_DB_NAME, GAMES_DB_NAME, importBundleSoft, type GameRecord } from '@/lib/state/io';
import { emitGamesSignal } from '@/lib/state/game-signals';
import { uuid } from '@/lib/utils';

type SaveGeneratedGameRuntimeOptions = Readonly<{
  gamesDbName?: string;
  stateDbName?: string;
  hydrateState?: boolean;
}>;

export type SaveGeneratedGameOptions = Readonly<
  Omit<GeneratedGameOptions, 'seed'> & {
    seed?: string | null;
  }
> &
  SaveGeneratedGameRuntimeOptions;

export type SaveGeneratedGameResult = Readonly<
  ReturnType<typeof generateGameData> & {
    seed: string;
  }
>;

const DEFAULT_RUNTIME_OPTIONS: Required<SaveGeneratedGameRuntimeOptions> = {
  gamesDbName: GAMES_DB_NAME,
  stateDbName: DEFAULT_DB_NAME,
  hydrateState: true,
};

export async function saveGeneratedGame(
  options: SaveGeneratedGameOptions,
): Promise<SaveGeneratedGameResult> {
  const runtime = resolveRuntimeOptions(options);
  const seed = resolveSeed(options.seed);

  const payload = generateGameData({
    currentUser: options.currentUser,
    playerCount: options.playerCount,
    roundCount: options.roundCount,
    startTimestamp: options.startTimestamp,
    seed,
  });

  if (runtime.hydrateState) {
    await importBundleSoft(runtime.stateDbName, payload.gameRecord.bundle);
  }

  await persistGameRecord(runtime.gamesDbName, payload.gameRecord);
  emitGamesSignal({ type: 'added', gameId: payload.gameRecord.id });

  return Object.freeze({ ...payload, seed });
}

function resolveRuntimeOptions(
  options: SaveGeneratedGameRuntimeOptions,
): Required<SaveGeneratedGameRuntimeOptions> {
  return {
    gamesDbName: options.gamesDbName?.trim() || DEFAULT_RUNTIME_OPTIONS.gamesDbName,
    stateDbName: options.stateDbName?.trim() || DEFAULT_RUNTIME_OPTIONS.stateDbName,
    hydrateState:
      typeof options.hydrateState === 'boolean'
        ? options.hydrateState
        : DEFAULT_RUNTIME_OPTIONS.hydrateState,
  };
}

function resolveSeed(input: string | null | undefined): string {
  const normalized = typeof input === 'string' ? input.trim() : '';
  if (normalized) return normalized;
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === 'function') {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      const value = array[0];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value.toString(36);
      }
    }
  }
  return uuid();
}

async function persistGameRecord(dbName: string, record: GameRecord): Promise<void> {
  const db = await openDB(dbName);
  try {
    const txWrite = tx(db, 'readwrite', [storeNames.GAMES]);
    const store = txWrite.objectStore(storeNames.GAMES);
    await new Promise<void>((resolve, reject) => {
      txWrite.oncomplete = () => resolve();
      txWrite.onerror = () =>
        reject(normalizeIdbError(txWrite.error, 'Failed to persist generated game record'));
      txWrite.onabort = () =>
        reject(normalizeIdbError(txWrite.error, 'Transaction aborted persisting game record'));

      const putRequest = store.put(ensureGameRecordDefaults(record));
      putRequest.onerror = () =>
        reject(normalizeIdbError(putRequest.error, 'Unable to store generated game record'));
    });
  } finally {
    db.close();
  }
}

function ensureGameRecordDefaults(record: GameRecord): GameRecord {
  if (record.deletedAt === undefined) {
    return { ...record, deletedAt: null };
  }
  return record;
}

function normalizeIdbError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) return error;
  if (error && typeof (error as { message?: unknown }).message === 'string') {
    return new Error(String((error as { message?: unknown }).message));
  }
  return new Error(fallbackMessage);
}
