import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  listBackfillCandidates,
  backfillGameById,
  runHistoricalSummaryBackfill,
  ensureHistoricalSummariesBackfilled,
} from '@/lib/state/player-statistics/backfill';

// Mock environment variables before importing the backfill module
const originalEnv = process.env;

// Mock external dependencies
vi.mock('@/lib/observability/browser', () => ({
  captureBrowserMessage: vi.fn(),
}));

vi.mock('@/lib/state/io', () => ({
  listGames: vi.fn(),
  summarizeState: vi.fn(),
  SUMMARY_METADATA_VERSION: 2,
  GAMES_DB_NAME: 'test-games-db',
  getGame: vi.fn(),
}));

vi.mock('@/lib/state/db', () => {
  const mockTx = vi.fn((db, mode, stores) => {
    const mockRequest = {
      onsuccess: null as ((event: any) => void) | null,
      onerror: null as ((event: any) => void) | null,
      result: undefined,
    };

    // Simulate successful operation
    setTimeout(() => {
      if (mockRequest.onsuccess) {
        mockRequest.onsuccess({ target: mockRequest });
      }
    }, 0);

    return {
      objectStore: vi.fn().mockReturnValue({
        put: vi.fn().mockReturnValue(mockRequest),
      }),
      onabort: vi.fn(),
      onerror: vi.fn(),
    };
  });

  return {
    openDB: vi.fn(),
    storeNames: {
      GAMES: 'games',
    },
    tx: mockTx,
  };
});

// Import mocked modules for setup
import { listGames, summarizeState, getGame, GAMES_DB_NAME } from '@/lib/state/io';
import { openDB } from '@/lib/state/db';
import { captureBrowserMessage } from '@/lib/observability/browser';
// Import the backfill module to access internal state for testing
import * as backfillModule from '@/lib/state/player-statistics/backfill';

const mockListGames = vi.mocked(listGames);
const mockSummarizeState = vi.mocked(summarizeState);
const mockGetGame = vi.mocked(getGame);
const mockOpenDB = vi.mocked(openDB);
const mockCaptureBrowserMessage = vi.mocked(captureBrowserMessage);

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

describe('backfill operations', () => {
  let mockStorage: MemoryStorage;
  let originalWindow: Window & typeof globalThis;
  let originalProcess: typeof process;
  let originalIndexedDB: typeof indexedDB;
  let originalPerformance: typeof performance;
  let mockDB: any;

  beforeEach(() => {
    mockStorage = new MemoryStorage();
    originalWindow = global.window;
    originalProcess = global.process;
    originalIndexedDB = global.indexedDB;
    originalPerformance = global.performance;

    // Setup mock DB
    mockDB = {
      close: vi.fn(),
    };

    vi.clearAllMocks();

    // Setup window with localStorage
    global.window = {
      localStorage: mockStorage,
    } as any;

    // Setup performance API with a more robust mock
    let callCount = 0;
    global.performance = {
      now: vi.fn(() => {
        callCount++;
        return 100 + callCount * 10; // Return increasing values
      }),
    } as any;

    // Setup indexedDB
    global.indexedDB = {
      open: vi.fn(),
      deleteDatabase: vi.fn(),
      databases: vi.fn(),
    } as any;

    // Reset process.env to original
    process.env = { ...originalEnv };

    // Clear any stored backfill version from memory by forcing module reload
    // This is tricky with ES modules, so we'll clear localStorage instead
    mockStorage.clear();
  });

  afterEach(() => {
    global.window = originalWindow;
    global.process = originalProcess;
    global.indexedDB = originalIndexedDB;
    global.performance = originalPerformance;
    mockStorage.clear();
  });

  describe('listBackfillCandidates', () => {
    it('lists games that need backfill', async () => {
      const mockGames = [
        {
          id: 'game1',
          title: 'Game 1',
          createdAt: 1000,
          finishedAt: 2000,
          summary: { metadata: { version: 1 } },
        },
        {
          id: 'game2',
          title: 'Game 2',
          createdAt: 1000,
          finishedAt: 3000,
          summary: { metadata: { version: 2 } },
        },
        {
          id: 'game3',
          title: 'Game 3',
          createdAt: 1000,
          finishedAt: 2500,
          summary: null,
        },
      ];

      mockListGames.mockResolvedValue(mockGames);

      const candidates = await listBackfillCandidates();

      expect(candidates).toHaveLength(2); // games with version < 2
      expect(candidates[0].id).toBe('game3');
      expect(candidates[1].id).toBe('game1');
      expect(candidates[0].metadataVersion).toBe(0);
      expect(candidates[1].metadataVersion).toBe(1);
    });

    it('sorts by finishedAt descending', async () => {
      const mockGames = [
        {
          id: 'game1',
          title: 'Game 1',
          createdAt: 1000,
          finishedAt: 1000,
          summary: { metadata: { version: 1 } },
        },
        {
          id: 'game2',
          title: 'Game 2',
          createdAt: 1000,
          finishedAt: 2000,
          summary: { metadata: { version: 1 } },
        },
      ];

      mockListGames.mockResolvedValue(mockGames);

      const candidates = await listBackfillCandidates();

      expect(candidates[0].id).toBe('game2');
      expect(candidates[1].id).toBe('game1');
    });

    it('uses custom database name', async () => {
      mockListGames.mockResolvedValue([]);

      await listBackfillCandidates({ gamesDbName: 'custom-db' });

      expect(mockListGames).toHaveBeenCalledWith('custom-db');
    });

    it('handles empty games list', async () => {
      mockListGames.mockResolvedValue([]);

      const candidates = await listBackfillCandidates();

      expect(candidates).toHaveLength(0);
    });

    it('handles games without summary', async () => {
      const mockGames = [
        {
          id: 'game1',
          title: 'Game 1',
          createdAt: 1000,
          finishedAt: 2000,
          summary: null,
        },
      ];

      mockListGames.mockResolvedValue(mockGames);

      const candidates = await listBackfillCandidates();

      expect(candidates).toHaveLength(1);
      expect(candidates[0].metadataVersion).toBe(0);
    });
  });

  describe('backfillGameById', () => {
    it('returns null for missing gameId', async () => {
      const result = await backfillGameById('');
      expect(result).toBeNull();

      const result2 = await backfillGameById(null as any);
      expect(result2).toBeNull();

      const result3 = await backfillGameById(undefined as any);
      expect(result3).toBeNull();
    });

    it('returns null when game not found', async () => {
      mockGetGame.mockResolvedValue(null);

      const result = await backfillGameById('nonexistent');

      expect(result).toBeNull();
      expect(mockCaptureBrowserMessage).toHaveBeenCalledWith(
        'player-stats.backfill.not-found',
        expect.objectContaining({
          level: 'warn',
          attributes: { gameId: 'nonexistent' },
        }),
      );
    });

    it('returns unchanged result when version is current', async () => {
      const mockRecord = {
        id: 'game1',
        title: 'Test Game',
        createdAt: 1000,
        finishedAt: 2000,
        summary: { metadata: { version: 2 }, scores: {} },
        bundle: { events: [] },
      };

      mockGetGame.mockResolvedValue(mockRecord);

      const result = await backfillGameById('game1');

      expect(result?.updated).toBe(false);
      expect(result?.previousSummary).toBe(mockRecord.summary);
      expect(result?.summary).toBe(mockRecord.summary);
    });

    it('backfills game with dry run', async () => {
      const mockRecord = {
        id: 'game1',
        title: 'Test Game',
        createdAt: 1000,
        finishedAt: 2000,
        summary: { metadata: { version: 1 }, scores: { p1: 10 } },
        bundle: { events: [] },
      };

      const mockSummary = {
        metadata: { version: 2, generatedAt: Date.now() },
        players: 1,
        scores: { p1: 10 },
        playersById: { p1: 'Player 1' },
        rosterSnapshot: {
          rosterId: null,
          playersById: { p1: 'Player 1' },
          playerTypesById: { p1: 'human' },
          displayOrder: { p1: 0 },
        },
      };

      mockGetGame.mockResolvedValue(mockRecord);
      mockSummarizeState.mockReturnValue(mockSummary);

      const result = await backfillGameById('game1', { dryRun: true });

      expect(result?.updated).toBe(false); // dry run
      expect(result?.summary.metadata.version).toBe(2);
      expect(mockOpenDB).not.toHaveBeenCalled(); // no DB operation in dry run
      expect(mockCaptureBrowserMessage).toHaveBeenCalledWith(
        'player-stats.backfill.single',
        expect.objectContaining({
          level: 'info',
          attributes: expect.objectContaining({
            gameId: 'game1',
            dryRun: true,
          }),
        }),
      );
    });

    it('writes backfilled game to database', async () => {
      const mockRecord = {
        id: 'game1',
        title: 'Test Game',
        createdAt: 1000,
        finishedAt: 2000,
        summary: { metadata: { version: 1 }, scores: { p1: 10 } },
        bundle: { events: [] },
      };

      const mockSummary = {
        metadata: { version: 2, generatedAt: Date.now() },
        players: 1,
        scores: { p1: 10 },
        playersById: { p1: 'Player 1' },
        rosterSnapshot: {
          rosterId: null,
          playersById: { p1: 'Player 1' },
          playerTypesById: { p1: 'human' },
          displayOrder: { p1: 0 },
        },
      };

      mockGetGame.mockResolvedValue(mockRecord);
      mockOpenDB.mockResolvedValue(mockDB);
      mockSummarizeState.mockReturnValue(mockSummary);

      const result = await backfillGameById('game1', { dryRun: false });

      expect(result?.updated).toBe(true);
      expect(mockOpenDB).toHaveBeenCalled();
      expect(mockDB.close).toHaveBeenCalled();
      expect(mockCaptureBrowserMessage).toHaveBeenCalledWith(
        'player-stats.backfill.single',
        expect.objectContaining({
          level: 'info',
          attributes: expect.objectContaining({
            gameId: 'game1',
            dryRun: false,
          }),
        }),
      );
    });

    it('handles DB close errors gracefully', async () => {
      const mockRecord = {
        id: 'game1',
        title: 'Test Game',
        createdAt: 1000,
        finishedAt: 2000,
        summary: { metadata: { version: 1 }, scores: { p1: 10 } },
        bundle: { events: [] },
      };

      const mockSummary = {
        metadata: { version: 2, generatedAt: Date.now() },
        players: 1,
        scores: { p1: 10 },
        playersById: { p1: 'Player 1' },
        rosterSnapshot: {
          rosterId: null,
          playersById: { p1: 'Player 1' },
          playerTypesById: { p1: 'human' },
          displayOrder: { p1: 0 },
        },
      };

      mockDB.close.mockImplementation(() => {
        throw new Error('Close error');
      });

      mockGetGame.mockResolvedValue(mockRecord);
      mockOpenDB.mockResolvedValue(mockDB);
      mockSummarizeState.mockReturnValue(mockSummary);

      const result = await backfillGameById('game1');

      expect(result?.updated).toBe(true);
      // Should not throw despite close error
    });

    it('uses custom database name', async () => {
      const mockRecord = {
        id: 'game1',
        title: 'Test Game',
        createdAt: 1000,
        finishedAt: 2000,
        summary: { metadata: { version: 1 }, scores: { p1: 10 } },
        bundle: { events: [] },
      };

      const mockSummary = {
        metadata: { version: 2, generatedAt: Date.now() },
        players: 1,
        scores: { p1: 10 },
        playersById: { p1: 'Player 1' },
        rosterSnapshot: {
          rosterId: null,
          playersById: { p1: 'Player 1' },
          playerTypesById: { p1: 'human' },
          displayOrder: { p1: 0 },
        },
      };

      mockGetGame.mockResolvedValue(mockRecord);
      mockOpenDB.mockResolvedValue(mockDB);
      mockSummarizeState.mockReturnValue(mockSummary);

      await backfillGameById('game1', { gamesDbName: 'custom-db' });

      expect(mockOpenDB).toHaveBeenCalledWith('custom-db');
    });
  });

  describe('runHistoricalSummaryBackfill', () => {
    it('runs backfill for candidates', async () => {
      const mockGames = [
        {
          id: 'game1',
          title: 'Game 1',
          createdAt: 1000,
          finishedAt: 2000,
          summary: { metadata: { version: 1 } },
        },
        {
          id: 'game2',
          title: 'Game 2',
          createdAt: 1000,
          finishedAt: 3000,
          summary: { metadata: { version: 1 } },
        },
      ];

      const mockRecord = {
        id: 'game1',
        title: 'Test Game',
        createdAt: 1000,
        finishedAt: 2000,
        summary: { metadata: { version: 1 }, scores: { p1: 10 } },
        bundle: { events: [] },
      };

      const mockSummary = {
        metadata: { version: 2, generatedAt: Date.now() },
        players: 1,
        scores: { p1: 10 },
        playersById: { p1: 'Player 1' },
        rosterSnapshot: {
          rosterId: null,
          playersById: { p1: 'Player 1' },
          playerTypesById: { p1: 'human' },
          displayOrder: { p1: 0 },
        },
      };

      mockListGames.mockResolvedValue(mockGames);
      mockGetGame.mockResolvedValue(mockRecord);
      mockOpenDB.mockResolvedValue(mockDB);
      mockSummarizeState.mockReturnValue(mockSummary);

      const onProgress = vi.fn();
      const result = await runHistoricalSummaryBackfill({ onProgress, limit: 10 });

      expect(result.processed).toBe(2);
      expect(result.updated).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.lastGameId).toBe('game1');
      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('handles processing errors', async () => {
      const mockGames = [
        {
          id: 'game1',
          title: 'Game 1',
          createdAt: 1000,
          finishedAt: 2000,
          summary: { metadata: { version: 1 } },
        },
      ];

      mockListGames.mockResolvedValue(mockGames);
      mockGetGame.mockRejectedValue(new Error('Processing error'));

      const result = await runHistoricalSummaryBackfill();

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.lastGameId).toBe('game1');
      expect(mockCaptureBrowserMessage).toHaveBeenCalledWith(
        'player-stats.backfill.failed',
        expect.objectContaining({
          level: 'warn',
          attributes: { gameId: 'game1', reason: 'Processing error' },
        }),
      );
    });

    it('respects limit parameter', async () => {
      const mockGames = [
        {
          id: 'game1',
          title: 'Game 1',
          createdAt: 1000,
          finishedAt: 2000,
          summary: { metadata: { version: 1 } },
        },
        {
          id: 'game2',
          title: 'Game 2',
          createdAt: 1000,
          finishedAt: 3000,
          summary: { metadata: { version: 1 } },
        },
        {
          id: 'game3',
          title: 'Game 3',
          createdAt: 1000,
          finishedAt: 4000,
          summary: { metadata: { version: 1 } },
        },
      ];

      mockListGames.mockResolvedValue(mockGames);
      mockGetGame.mockResolvedValue({
        id: 'test',
        summary: { metadata: { version: 1 } },
        bundle: { events: [] },
      });
      mockSummarizeState.mockReturnValue({
        metadata: { version: 2 },
        players: 1,
        scores: {},
        playersById: {},
        rosterSnapshot: {
          rosterId: null,
          playersById: {},
          playerTypesById: {},
          displayOrder: {},
        },
      });

      const result = await runHistoricalSummaryBackfill({ limit: 2 });

      expect(result.processed).toBe(2);
      expect(mockGetGame).toHaveBeenCalledTimes(2);
    });

    it('handles empty candidates list', async () => {
      mockListGames.mockResolvedValue([]);

      const onProgress = vi.fn();
      const result = await runHistoricalSummaryBackfill({ onProgress });

      expect(result.processed).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.lastGameId).toBeNull();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(onProgress).not.toHaveBeenCalled();
    });
  });

  describe('ensureHistoricalSummariesBackfilled', () => {
    it('returns null when shouldRunBackfill is false', async () => {
      // Mock indexedDB as undefined to disable backfill
      global.indexedDB = undefined as any;

      const result = await ensureHistoricalSummariesBackfilled();

      expect(result).toBeNull();
    });

    it('runs backfill when shouldRunBackfill is true', async () => {
      const mockGames = [
        {
          id: 'game1',
          title: 'Game 1',
          createdAt: 1000,
          finishedAt: 2000,
          summary: { metadata: { version: 1 } },
        },
      ];

      mockListGames.mockResolvedValue(mockGames);
      mockGetGame.mockResolvedValue({
        id: 'test',
        summary: { metadata: { version: 1 } },
        bundle: { events: [] },
      });
      mockSummarizeState.mockReturnValue({
        metadata: { version: 2 },
        players: 1,
        scores: {},
        playersById: {},
        rosterSnapshot: {
          rosterId: null,
          playersById: {},
          playerTypesById: {},
          displayOrder: {},
        },
      });

      const result = await ensureHistoricalSummariesBackfilled();

      expect(result?.processed).toBe(1);
      expect(result?.updated).toBe(1);
      expect(result?.failed).toBe(0);
    });

    it('persists backfill version when successful', async () => {
      const mockGames = [
        {
          id: 'game1',
          title: 'Game 1',
          createdAt: 1000,
          finishedAt: 2000,
          summary: { metadata: { version: 1 } },
        },
      ];

      const mockRecord = {
        id: 'game1',
        title: 'Test Game',
        createdAt: 1000,
        finishedAt: 2000,
        summary: { metadata: { version: 1 }, scores: { p1: 10 } },
        bundle: { events: [] },
      };

      const mockSummary = {
        metadata: { version: 2, generatedAt: Date.now() },
        players: 1,
        scores: { p1: 10 },
        playersById: { p1: 'Player 1' },
        rosterSnapshot: {
          rosterId: null,
          playersById: { p1: 'Player 1' },
          playerTypesById: { p1: 'human' },
          displayOrder: { p1: 0 },
        },
      };

      mockListGames.mockResolvedValue(mockGames);
      mockGetGame.mockResolvedValue(mockRecord);
      mockOpenDB.mockResolvedValue(mockDB);
      mockSummarizeState.mockReturnValue(mockSummary);

      const result = await ensureHistoricalSummariesBackfilled({ force: true });

      // Check that the backfill actually ran
      expect(result?.processed).toBe(1);
      expect(result?.updated).toBe(1);
      expect(result?.failed).toBe(0);

      // Now check version persistence
      expect(mockStorage.getItem('player-stats.backfill.version')).toBe('2');
    });

    it('handles force option bypassing version check', async () => {
      // Set version to current
      mockStorage.setItem('player-stats.backfill.version', '2');

      const mockGames = [
        {
          id: 'game1',
          title: 'Game 1',
          createdAt: 1000,
          finishedAt: 2000,
          summary: { metadata: { version: 1 } },
        },
      ];

      mockListGames.mockResolvedValue(mockGames);
      mockGetGame.mockResolvedValue({
        id: 'test',
        summary: { metadata: { version: 1 } },
        bundle: { events: [] },
      });
      mockSummarizeState.mockReturnValue({
        metadata: { version: 2 },
        players: 1,
        scores: {},
        playersById: {},
        rosterSnapshot: {
          rosterId: null,
          playersById: {},
          playerTypesById: {},
          displayOrder: {},
        },
      });

      const result = await ensureHistoricalSummariesBackfilled({ force: true });

      expect(result?.processed).toBe(1);
      expect(result?.updated).toBe(1);
    });

    it('handles server-side environment (no window)', async () => {
      delete (global as any).window;

      const mockGames = [
        {
          id: 'game1',
          title: 'Game 1',
          createdAt: 1000,
          finishedAt: 2000,
          summary: { metadata: { version: 1 } },
        },
      ];

      const mockRecord = {
        id: 'game1',
        title: 'Test Game',
        createdAt: 1000,
        finishedAt: 2000,
        summary: { metadata: { version: 1 }, scores: { p1: 10 } },
        bundle: { events: [] },
      };

      const mockSummary = {
        metadata: { version: 2, generatedAt: Date.now() },
        players: 1,
        scores: { p1: 10 },
        playersById: { p1: 'Player 1' },
        rosterSnapshot: {
          rosterId: null,
          playersById: { p1: 'Player 1' },
          playerTypesById: { p1: 'human' },
          displayOrder: { p1: 0 },
        },
      };

      mockListGames.mockResolvedValue(mockGames);
      mockGetGame.mockResolvedValue(mockRecord);
      mockOpenDB.mockResolvedValue(mockDB);
      mockSummarizeState.mockReturnValue(mockSummary);

      // Use force option to ensure it runs even without window localStorage
      const result = await ensureHistoricalSummariesBackfilled({ force: true });

      expect(result?.processed).toBe(1);
      // Should not throw when window is undefined
    });

    it('accepts custom options', async () => {
      const onProgress = vi.fn();
      const mockGames = [
        {
          id: 'game1',
          title: 'Game 1',
          createdAt: 1000,
          finishedAt: 2000,
          summary: { metadata: { version: 1 } },
        },
      ];

      mockListGames.mockResolvedValue(mockGames);
      mockGetGame.mockResolvedValue({
        id: 'test',
        summary: { metadata: { version: 1 } },
        bundle: { events: [] },
      });
      mockSummarizeState.mockReturnValue({
        metadata: { version: 2 },
        players: 1,
        scores: {},
        playersById: {},
        rosterSnapshot: {
          rosterId: null,
          playersById: {},
          playerTypesById: {},
          displayOrder: {},
        },
      });

      const result = await ensureHistoricalSummariesBackfilled({
        gamesDbName: 'custom-db',
        force: true,
        limit: 10,
        onProgress,
      });

      expect(result?.processed).toBe(1);
      expect(mockListGames).toHaveBeenCalledWith('custom-db');
    });
  });
});
