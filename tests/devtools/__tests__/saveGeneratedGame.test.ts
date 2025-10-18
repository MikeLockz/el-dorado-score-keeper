import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveGeneratedGame } from '@/lib/devtools/generator/saveGeneratedGame';
import { listGames } from '@/lib/state/io';
import * as gameSignals from '@/lib/state/game-signals';
import { openDB, storeNames, tx, type StoreName } from '@/lib/state/db';

const TEST_GAMES_DB = 'test-generated-games-db';
const TEST_STATE_DB = 'test-generated-state-db';

const CURRENT_USER = {
  id: 'test-user',
  displayName: 'Dev Tester',
  avatarSeed: 'dev-tester',
};

describe('saveGeneratedGame', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDatabase(TEST_GAMES_DB);
    await resetDatabase(TEST_STATE_DB);
  });

  it('persists generated game records and hydrates single player state', async () => {
    const signalSpy = vi.spyOn(gameSignals, 'emitGamesSignal').mockImplementation(() => {});

    const result = await saveGeneratedGame({
      currentUser: CURRENT_USER,
      seed: 'persist-seed',
      stateDbName: TEST_STATE_DB,
      gamesDbName: TEST_GAMES_DB,
    });

    expect(result.seed).toBe('persist-seed');
    expect(result.gameRecord.bundle.events).toHaveLength(result.events.length);

    const games = await listGames(TEST_GAMES_DB);
    expect(games).toHaveLength(1);
    expect(games[0]?.id).toBe(result.gameRecord.id);
    expect(games[0]?.summary.summaryEnteredAt).toBe(result.gameRecord.summary.summaryEnteredAt);

    const db = await openDB(TEST_STATE_DB);
    try {
      const eventCount = await countStoreRecords(db, storeNames.EVENTS);
      const stateCount = await countStoreRecords(db, storeNames.STATE);
      expect(eventCount).toBe(result.events.length);
      expect(stateCount).toBe(1);
    } finally {
      db.close();
    }

    expect(signalSpy).toHaveBeenCalledTimes(1);
    expect(signalSpy).toHaveBeenCalledWith({ type: 'added', gameId: result.gameRecord.id });
  });

  it('generates a seed when omitted and can skip reducer hydration', async () => {
    const signalSpy = vi.spyOn(gameSignals, 'emitGamesSignal').mockImplementation(() => {});

    const result = await saveGeneratedGame({
      currentUser: CURRENT_USER,
      gamesDbName: TEST_GAMES_DB,
      stateDbName: TEST_STATE_DB,
      hydrateState: false,
    });

    expect(typeof result.seed).toBe('string');
    expect(result.seed.length).toBeGreaterThan(0);

    const db = await openDB(TEST_STATE_DB);
    try {
      const eventCount = await countStoreRecords(db, storeNames.EVENTS);
      expect(eventCount).toBe(0);
    } finally {
      db.close();
    }

    expect(signalSpy).toHaveBeenCalledWith({ type: 'added', gameId: result.gameRecord.id });
  });
});

async function resetDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onblocked = () => resolve();
    request.onerror = () => resolve();
    request.onsuccess = () => resolve();
  });
}

async function countStoreRecords(db: IDBDatabase, store: StoreName): Promise<number> {
  const transaction = tx(db, 'readonly', [store]);
  const objectStore = transaction.objectStore(store);
  const request = objectStore.count();
  return new Promise<number>((resolve, reject) => {
    request.onsuccess = () => resolve(Number(request.result) || 0);
    request.onerror = () => reject(request.error ?? new Error('Failed counting store records'));
  });
}
