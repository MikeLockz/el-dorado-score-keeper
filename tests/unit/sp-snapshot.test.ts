import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildSinglePlayerSnapshot,
  persistSpSnapshot,
  resetSnapshotDedupeCache,
  loadLatestSnapshot,
  SINGLE_PLAYER_SNAPSHOT_VERSION,
  createIndexedDbAdapter,
  SP_GAME_INDEX_RETENTION_MS,
} from '@/lib/state/persistence/sp-snapshot';
import type { AppState } from '@/lib/state/types';
import { INITIAL_STATE } from '@/lib/state/types';
import { openDB, storeNames } from '@/lib/state/db';

function makeState() {
  const clone = JSON.parse(JSON.stringify(INITIAL_STATE)) as any;
  clone.sp = { ...clone.sp };
  clone.sp.currentGameId = 'game-1';
  clone.sp.phase = 'playing';
  clone.sp.order = ['p1', 'p2'];
  clone.sp.trickCounts = { p1: 1, p2: 0 };
  clone.sp.hands = {
    p1: [
      { suit: 'hearts', rank: 10 },
      { suit: 'clubs', rank: 2 },
    ],
    p2: [],
  };
  clone.sp.trickPlays = [{ playerId: 'p2', card: { suit: 'clubs', rank: 5 } }];
  clone.sp.sessionSeed = 42;
  clone.sp.roundTallies = { 1: { p1: 1, p2: 0 } };
  clone.activeSingleRosterId = 'r-single';
  clone.rosters = {
    'r-single': {
      name: 'Solo Roster',
      playersById: { p1: 'Alice', p2: 'Bot Bob' },
      playerTypesById: { p1: 'human', p2: 'bot' },
      displayOrder: { p1: 0, p2: 1 },
      type: 'single',
      createdAt: 123,
      archivedAt: null,
    },
  };
  clone.humanByMode = { single: 'p1' };
  clone.scores = { p1: 12, p2: 7, p3: 99 };
  clone.rounds = {
    ...clone.rounds,
    1: {
      state: 'bidding',
      bids: { p1: 1, p2: 0 },
      made: { p1: true, p2: false },
      present: { p1: true, p2: true },
    },
  };
  return clone as AppState;
}

function makeStateWithGameId(gameId: string) {
  const state = makeState();
  state.sp = {
    ...(state.sp as AppState['sp']),
    currentGameId: gameId,
    gameId,
  } as AppState['sp'];
  return state;
}

describe('buildSinglePlayerSnapshot', () => {
  beforeEach(() => {
    resetSnapshotDedupeCache();
  });

  it('returns null when no game id present', () => {
    const state = JSON.parse(JSON.stringify(INITIAL_STATE)) as AppState;
    const snapshot = buildSinglePlayerSnapshot(state, 10);
    expect(snapshot).toBeNull();
  });

  it('captures required single-player fields', () => {
    const state = makeState();
    const savedAt = 999;
    const snapshot = buildSinglePlayerSnapshot(state, 15, { savedAt });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.version).toBe(SINGLE_PLAYER_SNAPSHOT_VERSION);
    expect(snapshot?.height).toBe(15);
    expect(snapshot?.savedAt).toBe(savedAt);
    expect(snapshot?.gameId).toBe('game-1');
    expect(snapshot?.rosterId).toBe('r-single');
    expect(snapshot?.roster?.playersById).toEqual({ p1: 'Alice', p2: 'Bot Bob' });
    expect(snapshot?.roster?.playerTypesById).toEqual({ p1: 'human', p2: 'bot' });
    expect(snapshot?.humanId).toBe('p1');
    expect(snapshot?.scores).toEqual({ p1: 12, p2: 7 });
    expect(snapshot?.analytics.sessionSeed).toBe(42);
    expect(snapshot?.analytics.roundTallies).toEqual({ 1: { p1: 1, p2: 0 } });
    expect(snapshot?.sp).not.toBe((state as any).sp);
  });
});

describe('persistSpSnapshot', () => {
  beforeEach(() => {
    resetSnapshotDedupeCache();
  });

  it('skips when snapshot data unchanged at same height', async () => {
    const state = makeState();
    const dbWrites: any[] = [];
    const localWrites: string[] = [];
    const adapters = {
      indexedDb: {
        write: async (snapshot: any) => {
          dbWrites.push(snapshot);
        },
      },
      localStorage: {
        write: ({ serialized }: { serialized: string }) => {
          localWrites.push(serialized);
        },
        read: () => localWrites.at(-1) ?? null,
        clear: () => {
          localWrites.length = 0;
        },
      },
    };
    const first = await persistSpSnapshot(state, 20, {
      adapters,
    });
    expect(first.persisted).toBe(true);
    expect(dbWrites.length).toBe(1);
    expect(localWrites.length).toBe(1);

    const second = await persistSpSnapshot(state, 20, {
      adapters,
    });
    expect(second.persisted).toBe(false);
    expect(second.skippedReason).toBe('dedupe');
    expect(dbWrites.length).toBe(1);
    expect(localWrites.length).toBe(1);
  });

  it('clears adapters when provided null state', async () => {
    let clearedDb = 0;
    let clearedLocal = 0;
    const adapters = {
      indexedDb: {
        write: async () => {},
        clear: async () => {
          clearedDb++;
        },
      },
      localStorage: {
        write: () => {},
        clear: () => {
          clearedLocal++;
        },
      },
    };
    const result = await persistSpSnapshot(null, 0, { adapters });
    expect(result.persisted).toBe(false);
    expect(result.skippedReason).toBe('state-null');
    expect(clearedDb).toBe(1);
    expect(clearedLocal).toBe(1);
  });

  it('clears mirrors when session becomes inactive without a game id', async () => {
    const state = makeState();
    let clearedDb = 0;
    let clearedLocal = 0;
    let writes = 0;
    const adapters = {
      indexedDb: {
        write: async () => {
          writes++;
        },
        clear: async () => {
          clearedDb++;
        },
      },
      localStorage: {
        write: () => {},
        clear: () => {
          clearedLocal++;
        },
      },
    };

    await persistSpSnapshot(state, 5, { adapters });
    expect(writes).toBe(1);
    const inactiveState = JSON.parse(JSON.stringify(state)) as AppState;
    inactiveState.sp = {
      ...(inactiveState.sp as AppState['sp']),
      phase: 'setup',
      order: [],
      trickPlays: [],
      hands: {},
    };
    delete (inactiveState.sp as any).currentGameId;
    delete (inactiveState.sp as any).gameId;

    const result = await persistSpSnapshot(inactiveState, 6, { adapters });
    expect(result.persisted).toBe(false);
    expect(result.skippedReason).toBe('no-active-session');
    expect(clearedDb).toBe(1);
    expect(clearedLocal).toBe(1);

    await persistSpSnapshot(inactiveState, 7, { adapters });
    expect(clearedDb).toBe(1);
    expect(clearedLocal).toBe(1);
  });

  it('writes snapshot and game index records to IndexedDB', async () => {
    const dbName = `sp-snap-${Math.random().toString(36).slice(2)}`;
    const db = await openDB(dbName);
    try {
      const state = makeState();
      const first = await persistSpSnapshot(state, 42, {
        adapters: { indexedDb: createIndexedDbAdapter(db) },
      });
      expect(first.persisted).toBe(true);

      const snapshotRecord = await new Promise<any>((resolve, reject) => {
        const t = db.transaction([storeNames.STATE], 'readonly');
        const req = t.objectStore(storeNames.STATE).get('sp/snapshot');
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error ?? new Error('failed to read sp/snapshot'));
      });
      expect(snapshotRecord?.snapshot?.gameId).toBe('game-1');
      expect(snapshotRecord?.snapshot?.height).toBe(42);

      const indexRecord = await new Promise<any>((resolve, reject) => {
        const t = db.transaction([storeNames.STATE], 'readonly');
        const req = t.objectStore(storeNames.STATE).get('sp/game-index');
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error ?? new Error('failed to read sp/game-index'));
      });
      expect(indexRecord?.games?.['game-1']?.height).toBe(42);
      expect(typeof indexRecord?.games?.['game-1']?.savedAt).toBe('number');

      const nextState = makeState();
      nextState.sp = { ...nextState.sp, currentGameId: 'game-1' } as AppState['sp'];
      const second = await persistSpSnapshot(nextState, 43, {
        adapters: { indexedDb: createIndexedDbAdapter(db) },
      });
      expect(second.persisted).toBe(true);

      const updatedIndex = await new Promise<any>((resolve, reject) => {
        const t = db.transaction([storeNames.STATE], 'readonly');
        const req = t.objectStore(storeNames.STATE).get('sp/game-index');
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error ?? new Error('failed to read sp/game-index'));
      });
      expect(updatedIndex?.games?.['game-1']?.height).toBe(43);
    } finally {
      db.close();
    }
  });

  it('removes expired game index entries beyond retention window', async () => {
    const base = Date.now();
    const dbName = `sp-snap-ret-${Math.random().toString(36).slice(2)}`;
    const db = await openDB(dbName);
    try {
      const expiredState = makeStateWithGameId('expired-game');
      const expiredTimestamp = base - SP_GAME_INDEX_RETENTION_MS - 10_000;
      await persistSpSnapshot(expiredState, 1, {
        adapters: { indexedDb: createIndexedDbAdapter(db) },
        now: () => expiredTimestamp,
      });

      for (let i = 0; i < 9; i++) {
        const state = makeStateWithGameId(`fresh-${i}`);
        const savedAt = base + 10_000 + i * 1_000;
        await persistSpSnapshot(state, i + 2, {
          adapters: { indexedDb: createIndexedDbAdapter(db) },
          now: () => savedAt,
        });
      }

      const indexRecord = await new Promise<any>((resolve, reject) => {
        const t = db.transaction([storeNames.STATE], 'readonly');
        const req = t.objectStore(storeNames.STATE).get('sp/game-index');
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error ?? new Error('failed to read sp/game-index'));
      });

      const games = Object.keys(indexRecord?.games ?? {});
      expect(games).not.toContain('expired-game');
      expect(games.length).toBeLessThanOrEqual(8);
    } finally {
      db.close();
    }
  }, 10000);
});

describe('loadLatestSnapshot', () => {
  beforeEach(() => {
    resetSnapshotDedupeCache();
  });

  it('prefers IndexedDB adapter when available', async () => {
    const state = makeState();
    const snapshot = buildSinglePlayerSnapshot(state, 2)!;
    const adapters = {
      indexedDb: {
        write: async () => {},
        read: async () => snapshot,
      },
      localStorage: {
        read: () => JSON.stringify(snapshot),
      },
    };
    const loaded = await loadLatestSnapshot({ adapters });
    expect(loaded).toEqual(snapshot);
  });

  it('falls back to localStorage when IndexedDB fails', async () => {
    const state = makeState();
    const snapshot = buildSinglePlayerSnapshot(state, 4)!;
    const stored = JSON.stringify(snapshot);
    const adapters = {
      indexedDb: {
        write: async () => {},
        read: async () => null,
      },
      localStorage: {
        read: () => stored,
      },
    };
    const loaded = await loadLatestSnapshot({ adapters });
    expect(loaded).toEqual(snapshot);
  });
});
