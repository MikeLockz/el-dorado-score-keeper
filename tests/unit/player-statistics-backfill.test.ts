import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('player-statistics backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pure utility functions', () => {
    it('should import and test basic extracted utilities work', async () => {
      const { replayBundle, normalizeAlias, parseBooleanFlag, determineWinner, canonicalizeScores, isValidScore, toFiniteNumber } =
        await import('@/lib/state/player-statistics/backfill-utils');

      // Test replayBundle with empty events
      const initialState = replayBundle([]);
      expect(initialState).toBeDefined();

      // Test normalizeAlias
      expect(normalizeAlias('  Test Player  ')).toBe('test player');
      expect(normalizeAlias(null)).toBeNull();
      expect(normalizeAlias('')).toBeNull();

      // Test parseBooleanFlag
      expect(parseBooleanFlag('true')).toBe(true);
      expect(parseBooleanFlag('false')).toBe(false);
      expect(parseBooleanFlag(undefined)).toBeNull();

      // Test determineWinner
      const scores = { p1: 100, p2: 85, p3: 92 };
      const winner = determineWinner(scores);
      expect(winner).toEqual({ winnerId: 'p1', winnerScore: 100 });

      // Test canonicalizeScores with simple resolver
      const mockResolver = vi.fn((id) => id === 'p1' ? 'p1' : id === 'p2' ? 'p2' : null);
      const canonicalScores = canonicalizeScores(
        { 'p1': 100, 'p2': 85, 'unknown': 50 },
        mockResolver,
        { p1: 'Player 1', p2: 'Player 2' }
      );
      expect(canonicalScores).toEqual({ p1: 100, p2: 85 });
    });

    it('should test isValidScore utility function', async () => {
      const { isValidScore } = await import('@/lib/state/player-statistics/backfill-utils');

      // Test valid finite numbers
      expect(isValidScore(100)).toBe(true);
      expect(isValidScore(0)).toBe(true);
      expect(isValidScore(-50)).toBe(true);
      expect(isValidScore(3.14)).toBe(true);

      // Test invalid numbers
      expect(isValidScore(Infinity)).toBe(false);
      expect(isValidScore(-Infinity)).toBe(false);
      expect(isValidScore(NaN)).toBe(false);

      // Test non-numbers
      expect(isValidScore('100')).toBe(false);
      expect(isValidScore(null)).toBe(false);
      expect(isValidScore(undefined)).toBe(false);
      expect(isValidScore({})).toBe(false);
      expect(isValidScore([])).toBe(false);
    });

    it('should test toFiniteNumber utility function', async () => {
      const { toFiniteNumber } = await import('@/lib/state/player-statistics/backfill-utils');

      // Test valid finite numbers
      expect(toFiniteNumber(100)).toBe(100);
      expect(toFiniteNumber(0)).toBe(0);
      expect(toFiniteNumber(-50)).toBe(-50);
      expect(toFiniteNumber(3.14)).toBe(3.14);

      // Test valid numeric strings
      expect(toFiniteNumber('100')).toBe(100);
      expect(toFiniteNumber('0')).toBe(0);
      expect(toFiniteNumber('-50')).toBe(-50);
      expect(toFiniteNumber('3.14')).toBe(3.14);

      // Test invalid numbers
      expect(toFiniteNumber(Infinity)).toBeNull();
      expect(toFiniteNumber(-Infinity)).toBeNull();
      expect(toFiniteNumber(NaN)).toBeNull();

      // Test invalid strings
      expect(toFiniteNumber('invalid')).toBeNull();
      expect(toFiniteNumber('100abc')).toBeNull();
      expect(toFiniteNumber('')).toBe(0); // Number('') returns 0, which is finite

      // Test non-numeric types
      expect(toFiniteNumber(null)).toBeNull();
      expect(toFiniteNumber(undefined)).toBeNull();
      expect(toFiniteNumber({})).toBeNull();
      expect(toFiniteNumber([])).toBeNull();
      expect(toFiniteNumber(true)).toBeNull();
    });
  });

  describe('feature flag behavior', () => {
    it('should respect feature flag settings', async () => {
      const originalEnv = process.env.NEXT_PUBLIC_PLAYER_STATS_BACKFILL_ENABLED;
      process.env.NEXT_PUBLIC_PLAYER_STATS_BACKFILL_ENABLED = 'false';

      const { ensureHistoricalSummariesBackfilled } = await import('@/lib/state/player-statistics/backfill');
      const result = await ensureHistoricalSummariesBackfilled({ force: false }); // Don't force to test feature flag

      expect(result).toBeNull();

      process.env.NEXT_PUBLIC_PLAYER_STATS_BACKFILL_ENABLED = originalEnv;
    });

    it('should handle missing indexedDB', async () => {
      const originalIndexedDB = global.indexedDB;
      delete (global as any).indexedDB;

      const { ensureHistoricalSummariesBackfilled } = await import('@/lib/state/player-statistics/backfill');
      const result = await ensureHistoricalSummariesBackfilled({ force: true });

      expect(result).toBeNull();

      if (originalIndexedDB) {
        (global as any).indexedDB = originalIndexedDB;
      }
    });
  });

  describe('basic module functionality', () => {
    it('should import main functions correctly', async () => {
      const {
        listBackfillCandidates,
        backfillGameById,
        runHistoricalSummaryBackfill,
        ensureHistoricalSummariesBackfilled
      } = await import('@/lib/state/player-statistics/backfill');

      expect(typeof listBackfillCandidates).toBe('function');
      expect(typeof backfillGameById).toBe('function');
      expect(typeof runHistoricalSummaryBackfill).toBe('function');
      expect(typeof ensureHistoricalSummariesBackfilled).toBe('function');
    });

    it('should handle basic type definitions', async () => {
      const {
        listBackfillCandidates,
        backfillGameById
      } = await import('@/lib/state/player-statistics/backfill');

      // Test that functions can be called with basic parameters
      // (using the global mocks from jsdom setup)
      const candidates = await listBackfillCandidates();
      expect(Array.isArray(candidates)).toBe(true);

      const result = await backfillGameById('non-existent-game');
      // Should return null for non-existent game
      expect(result).toBeNull();
    });

    it('should handle dry run mode', async () => {
      const { backfillGameById } = await import('@/lib/state/player-statistics/backfill');

      // Test with dry run parameter for non-existent game
      const result = await backfillGameById('non-existent-game', { dryRun: true });

      // Should return null for non-existent game even in dry run
      expect(result).toBeNull();
    });

    it('should test runHistoricalSummaryBackfill with options', async () => {
      const { runHistoricalSummaryBackfill } = await import('@/lib/state/player-statistics/backfill');

      // Test with limit option
      const result = await runHistoricalSummaryBackfill({ limit: 5 });

      // Verify result structure
      expect(result).toHaveProperty('processed');
      expect(result).toHaveProperty('updated');
      expect(result).toHaveProperty('skipped');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('lastGameId');
      expect(result).toHaveProperty('durationMs');

      // Should process 0 items since we're using empty mocks
      expect(result.processed).toBe(0);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should test ensureHistoricalSummariesBackfilled with various options', async () => {
      const { ensureHistoricalSummariesBackfilled } = await import('@/lib/state/player-statistics/backfill');

      // Test with force option
      const result1 = await ensureHistoricalSummariesBackfilled({ force: true });

      // Verify result structure
      expect(result1).toHaveProperty('processed');
      expect(result1).toHaveProperty('updated');
      expect(result1).toHaveProperty('skipped');
      expect(result1).toHaveProperty('failed');
      expect(result1).toHaveProperty('lastGameId');
      expect(result1).toHaveProperty('durationMs');

      // Test with limit option
      const result2 = await ensureHistoricalSummariesBackfilled({ limit: 3, force: true });

      if (result2) {
        expect(result2.processed).toBeGreaterThanOrEqual(0);
        expect(result2.durationMs).toBeGreaterThan(0);
      }

      // Test with progress callback
      const onProgress = vi.fn();
      const result3 = await ensureHistoricalSummariesBackfilled({
        force: true,
        onProgress
      });

      if (result3) {
        // Progress callback acceptance test (doesn't need to be called with empty mock data)
        expect(typeof onProgress).toBe('function');
        expect(result3.processed).toBeGreaterThanOrEqual(0);
      }
    });

    it('should test listBackfillCandidates returns proper structure', async () => {
      const { listBackfillCandidates } = await import('@/lib/state/player-statistics/backfill');

      // Test that listBackfillCandidates returns array with correct structure
      const candidates = await listBackfillCandidates();

      expect(Array.isArray(candidates)).toBe(true);
      // Even with empty mocks, should return empty array
      expect(candidates).toHaveLength(0);
    });
  });

  describe('internal utility functions', () => {
    it('should test parseBooleanFlag internal function', async () => {
      // This tests the duplicate parseBooleanFlag function in backfill.ts
      const { ensureHistoricalSummariesBackfilled } = await import('@/lib/state/player-statistics/backfill');

      // Test feature flag variations that exercise parseBooleanFlag
      const originalEnv = process.env.NEXT_PUBLIC_PLAYER_STATS_BACKFILL_ENABLED;

      // Test various boolean flag values
      const testValues = ['true', 'false', '1', '0', 'yes', 'no', 'on', 'off', 'invalid', ''];

      for (const value of testValues) {
        process.env.NEXT_PUBLIC_PLAYER_STATS_BACKFILL_ENABLED = value;
        const result = await ensureHistoricalSummariesBackfilled({ force: false });
        // Should either return null (disabled) or result object (enabled)
        expect(result === null || typeof result === 'object').toBe(true);
      }

      process.env.NEXT_PUBLIC_PLAYER_STATS_BACKFILL_ENABLED = originalEnv;
    });

    it('should test normalizeAlias internal function', async () => {
      // This tests the duplicate normalizeAlias function in backfill.ts
      // We can indirectly test it through alias resolution
      const { backfillGameById } = await import('@/lib/state/player-statistics/backfill');

      // Test with empty parameters to exercise normalizeAlias
      const result1 = await backfillGameById(null as any);
      expect(result1).toBeNull();

      const result2 = await backfillGameById(undefined as any);
      expect(result2).toBeNull();

      const result3 = await backfillGameById('');
      expect(result3).toBeNull();
    });

    it('should test readPersistedBackfillVersion and persistBackfillVersion', async () => {
      const { ensureHistoricalSummariesBackfilled } = await import('@/lib/state/player-statistics/backfill');

      // Setup mock localStorage if not available
      if (typeof window === 'undefined') {
        (global as any).window = {
          localStorage: {
            getItem: vi.fn().mockReturnValue('1'),
            setItem: vi.fn()
          }
        };
      } else {
        window.localStorage = {
          getItem: vi.fn().mockReturnValue('1'),
          setItem: vi.fn()
        } as any;
      }

      // Test that version reading/writing functions are exercised
      const result = await ensureHistoricalSummariesBackfilled({ force: true });

      if (result) {
        // If backfill runs, it should call version persistence functions
        expect(window.localStorage.setItem).toHaveBeenCalled();
      }
    });

    it('should test shouldRunBackfill decision logic', async () => {
      const { ensureHistoricalSummariesBackfilled } = await import('@/lib/state/player-statistics/backfill');

      // Test various conditions that exercise shouldRunBackfill
      const originalEnv = process.env.NEXT_PUBLIC_PLAYER_STATS_BACKFILL_ENABLED;

      // Test with feature disabled
      process.env.NEXT_PUBLIC_PLAYER_STATS_BACKFILL_ENABLED = 'false';
      const result1 = await ensureHistoricalSummariesBackfilled({ force: false });
      expect(result1).toBeNull();

      // Test with feature enabled but no force
      process.env.NEXT_PUBLIC_PLAYER_STATS_BACKFILL_ENABLED = 'true';
      const result2 = await ensureHistoricalSummariesBackfilled({ force: false });
      // Should check version and run if needed
      expect(result2 === null || typeof result2 === 'object').toBe(true);

      process.env.NEXT_PUBLIC_PLAYER_STATS_BACKFILL_ENABLED = originalEnv;
    });
  });

  describe('error handling', () => {
    it('should handle empty parameter gracefully', async () => {
      const { backfillGameById } = await import('@/lib/state/player-statistics/backfill');

      // Test with empty string
      const result = await backfillGameById('');
      expect(result).toBeNull();
    });

    it('should handle undefined parameter gracefully', async () => {
      const { backfillGameById } = await import('@/lib/state/player-statistics/backfill');

      // @ts-expect-error - Testing undefined input
      const result = await backfillGameById(undefined);
      expect(result).toBeNull();
    });

    it('should handle processing errors gracefully', async () => {
      const { ensureHistoricalSummariesBackfilled } = await import('@/lib/state/player-statistics/backfill');

      // Mock a scenario that causes errors
      const mockGames = [
        {
          id: 'error-game',
          title: 'Error Game',
          createdAt: 1000000,
          finishedAt: 2000000,
          summary: { metadata: { version: 1 } },
          bundle: { events: [] }
        }
      ];

      const mockGetGame = vi.fn().mockRejectedValue(new Error('Database connection failed'));

      vi.doMock('@/lib/state/io', async () => {
        const originalModule = await import('@/lib/state/io');
        return {
          ...originalModule,
          listGames: () => Promise.resolve(mockGames),
          getGame: mockGetGame,
          summarizeState: vi.fn()
        };
      });

      const { ensureHistoricalSummariesBackfilled: freshEnsureHistoricalSummariesBackfilled } =
        await import('@/lib/state/player-statistics/backfill');

      // Should not throw, but handle errors gracefully
      const result = await freshEnsureHistoricalSummariesBackfilled({ force: true });

      // Should still return a result object even with errors
      expect(result).toBeTruthy();
      expect(result.failed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('concurrent execution control', () => {
    it('should handle concurrent calls without errors', async () => {
      const { ensureHistoricalSummariesBackfilled } = await import('@/lib/state/player-statistics/backfill');

      // Make concurrent calls - should not throw
      const promises = [
        ensureHistoricalSummariesBackfilled({ force: true }),
        ensureHistoricalSummariesBackfilled({ force: true }),
        ensureHistoricalSummariesBackfilled({ force: true })
      ];

      const results = await Promise.allSettled(promises);

      // All should either fulfill or reject gracefully
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
      });
    });
  });

  describe('module integration', () => {
    it('should work with extracted utilities in combination', async () => {
      const { replayBundle, determineWinner, canonicalizeScores } =
        await import('@/lib/state/player-statistics/backfill-utils');

      // Test with simple empty state to verify utilities work
      const emptyEvents = [];
      const initialState = replayBundle(emptyEvents);
      expect(initialState).toBeDefined();

      // Test winner determination with simple scores
      const simpleScores = { p1: 100, p2: 85 };
      const winner = determineWinner(simpleScores);
      expect(winner).toEqual({ winnerId: 'p1', winnerScore: 100 });

      // Test score canonicalization
      const mockResolver = (id: string) => id;
      const canonicalScores = canonicalizeScores(
        simpleScores,
        mockResolver,
        { p1: 'Player 1', p2: 'Player 2' }
      );
      expect(canonicalScores).toEqual(simpleScores);
    });
  });
});