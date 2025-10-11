import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createIndexedDbAdapter,
  createLocalStorageAdapter,
  persistSpSnapshot,
  resetSnapshotDedupeCache,
  buildSinglePlayerSnapshot,
  SINGLE_PLAYER_SNAPSHOT_STORAGE_KEY,
} from '@/lib/state/persistence/sp-snapshot';
import { rehydrateSinglePlayerFromSnapshot } from '@/lib/state/persistence/sp-rehydrate';
import type { AppState } from '@/lib/state/types';
import { INITIAL_STATE } from '@/lib/state/types';
import { openDB } from '@/lib/state/db';

function makeState(): AppState {
  const clone = JSON.parse(JSON.stringify(INITIAL_STATE)) as AppState;
  const mutable = clone as AppState & {
    sp: AppState['sp'] & { currentGameId?: string };
  };
  mutable.players = { p1: 'Alice', p2: 'Bot Bob' };
  mutable.playerDetails = {
    p1: {
      name: 'Alice',
      type: 'human',
      archived: false,
      archivedAt: null,
      createdAt: 0,
      updatedAt: 0,
    },
    p2: {
      name: 'Bot Bob',
      type: 'bot',
      archived: false,
      archivedAt: null,
      createdAt: 0,
      updatedAt: 0,
    },
  } as AppState['playerDetails'];
  mutable.rosters = {
    'r-single': {
      name: 'Solo Roster',
      playersById: { p1: 'Alice', p2: 'Bot Bob' },
      playerTypesById: { p1: 'human', p2: 'bot' },
      displayOrder: { p1: 0, p2: 1 },
      type: 'single',
      createdAt: 1,
      archivedAt: null,
    },
  } as AppState['rosters'];
  mutable.activeSingleRosterId = 'r-single';
  mutable.humanByMode = { single: 'p1' };
  mutable.scores = { p1: 10, p2: 5 };
  mutable.rounds = {
    1: {
      state: 'bidding',
      bids: { p1: 1, p2: 0 },
      made: { p1: true, p2: false },
      present: { p1: true, p2: true },
    },
  } as AppState['rounds'];
  mutable.sp = {
    ...mutable.sp,
    currentGameId: 'game-1',
    phase: 'playing',
    roundNo: 1,
    dealerId: 'p1',
    order: ['p1', 'p2'],
    trump: 'hearts',
    trumpCard: { suit: 'hearts', rank: 12 },
    hands: {
      p1: [
        { suit: 'hearts', rank: 11 },
        { suit: 'spades', rank: 9 },
      ],
      p2: [{ suit: 'clubs', rank: 5 }],
    },
    trickPlays: [
      { playerId: 'p2', card: { suit: 'clubs', rank: 5 } },
    ],
    trickCounts: { p1: 1, p2: 0 },
    trumpBroken: true,
    leaderId: 'p1',
    reveal: null,
    handPhase: 'idle',
    lastTrickSnapshot: null,
    sessionSeed: 42,
    roundTallies: { 1: { p1: 1, p2: 0 } },
  };
  return mutable as AppState;
}

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('sp rehydrate', () => {
  let db: IDBDatabase | null = null;
  const storage = new MemoryStorage();

  beforeEach(async () => {
    resetSnapshotDedupeCache();
    storage.clear();
    if (db) {
      db.close();
      db = null;
    }
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('applies snapshot from IndexedDB when available', async () => {
    const state = makeState();
    db = await openDB(`rehydrate-${Math.random().toString(36).slice(2)}`);
    await persistSpSnapshot(state, 41, {
      adapters: {
        indexedDb: createIndexedDbAdapter(db),
        localStorage: createLocalStorageAdapter(storage),
      },
    });

    const result = await rehydrateSinglePlayerFromSnapshot({
      gameId: 'game-1',
      adapters: {
        indexedDb: createIndexedDbAdapter(db),
        localStorage: createLocalStorageAdapter(storage),
      },
      baseState: INITIAL_STATE,
    });

    expect(result.applied).toBe(true);
    expect(result.height).toBe(41);
    expect(result.state?.sp.order).toEqual(['p1', 'p2']);
    expect(result.state?.scores).toEqual({ p1: 10, p2: 5 });
    expect(result.source).toBe('indexed-db');
  });

  it('falls back to localStorage when IndexedDB snapshot missing', async () => {
    const state = makeState();
    const snapshot = buildSinglePlayerSnapshot(state, 55);
    expect(snapshot).not.toBeNull();
    if (!snapshot) throw new Error('expected snapshot');
    storage.setItem(SINGLE_PLAYER_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));

    const result = await rehydrateSinglePlayerFromSnapshot({
      gameId: 'game-1',
      adapters: {
        indexedDb: {
          write: async () => {},
          read: async () => null,
          readIndex: async () => ({}),
        },
        localStorage: createLocalStorageAdapter(storage),
      },
      allowLocalStorageFallback: true,
      baseState: INITIAL_STATE,
    });

    expect(result.applied).toBe(true);
    expect(result.height).toBe(55);
    expect(result.source).toBe('local-storage');
    expect(result.state?.activeSingleRosterId).toBe('r-single');
  });

  it('returns unapplied when no snapshot found', async () => {
    const result = await rehydrateSinglePlayerFromSnapshot({
      gameId: 'missing',
      adapters: {
        indexedDb: {
          write: async () => {},
          read: async () => null,
          readIndex: async () => ({}),
        },
        localStorage: createLocalStorageAdapter(storage),
      },
      baseState: INITIAL_STATE,
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('game-index-missing');
    expect(result.state).toBeNull();
  });
});
