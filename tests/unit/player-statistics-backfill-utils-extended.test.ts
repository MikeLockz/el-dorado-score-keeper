import { describe, it, expect } from 'vitest';
import {
  deriveCanonicalRosterSnapshot,
  createAliasResolver,
  canonicalizeScores
} from '@/lib/state/player-statistics/backfill-utils';
import type { AppState, AppEvent } from '@/lib/state/types';

describe('player-statistics backfill-utils-extended', () => {
  // Realistic game data fixtures
  const realisticGameState: AppState = {
    players: {
      'p1': 'Alice',
      'p2': 'Bob',
      'p3': 'Charlie'
    },
    playerDetails: {
      'p1': { name: 'Alice', type: 'human' },
      'p2': { name: 'Bob', type: 'bot' },
      'p3': { name: 'Charlie', type: 'human' }
    },
    scores: {
      'p1': 100,
      'p2': 85,
      'p3': 92
    },
    sp: {
      phase: 'active',
      roundNo: 3,
      order: ['p1', 'p2', 'p3'],
      trump: 'hearts',
      hands: {
        'p1': [
          { suit: 'hearts', rank: 14 },
          { suit: 'spades', rank: 13 }
        ],
        'p2': [
          { suit: 'clubs', rank: 12 },
          { suit: 'diamonds', rank: 11 }
        ],
        'p3': [
          { suit: 'spades', rank: 10 },
          { suit: 'hearts', rank: 9 }
        ]
      }
    },
    rounds: {
      '1': {
        bids: { 'p1': 3, 'p2': 2, 'p3': 4 },
        made: { 'p1': 3, 'p2': 2, 'p3': 4 },
        state: 'locked'
      },
      '2': {
        bids: { 'p1': 4, 'p2': 3, 'p3': 3 },
        made: { 'p1': 4, 'p2': 3, 'p3': 3 },
        state: 'locked'
      }
    }
  };

  const realisticSummary = {
    metadata: { version: 2 },
    players: {
      playersById: { p1: 'Alice', p2: 'Bob', p3: 'Charlie' },
      playerTypesById: { p1: 'human', p2: 'bot', p3: 'human' }
    },
    scores: { p1: 100, p2: 85, p3: 92 },
    sp: {
      order: ['p1', 'p2', 'p3'],
      trickCounts: { p1: 5, p2: 3, p3: 4 }
    },
    rosterSnapshot: {
      rosterId: 'roster-1',
      playersById: { p1: 'Alice', p2: 'Bob', p3: 'Charlie' },
      playerTypesById: { p1: 'human', p2: 'bot', p3: 'human' },
      displayOrder: { p1: 0, p2: 1, p3: 2 }
    },
    slotMapping: {
      aliasToId: {
        'alice': 'p1',
        'player 1': 'p1',
        'bob': 'p2',
        'player 2': 'p2',
        'charlie': 'p3',
        'player 3': 'p3'
      }
    }
  };

  describe('deriveCanonicalRosterSnapshot', () => {
    it('should build snapshot from state when no existing snapshot', () => {
      const summary = {};
      const result = deriveCanonicalRosterSnapshot(summary, realisticGameState);

      expect(result.rosterId).toBeNull();
      expect(result.playersById).toEqual({
        p1: 'Alice',
        p2: 'Bob',
        p3: 'Charlie'
      });
      expect(result.playerTypesById).toEqual({
        p1: 'human',
        p2: 'bot',
        p3: 'human'
      });
      expect(result.displayOrder).toEqual({
        p1: 0,
        p2: 1,
        p3: 2
      });
    });

    it('should merge with existing snapshot when available', () => {
      const result = deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState);

      expect(result.rosterId).toBe('roster-1');
      expect(result.playersById).toEqual({
        p1: 'Alice',
        p2: 'Bob',
        p3: 'Charlie'
      });
      expect(result.playerTypesById).toEqual({
        p1: 'human',
        p2: 'bot',
        p3: 'human'
      });
      expect(result.displayOrder).toEqual({
        p1: 0,
        p2: 1,
        p3: 2
      });
    });

    it('should use state player name when snapshot is missing name', () => {
      const summaryWithMissingNames = {
        ...realisticSummary,
        rosterSnapshot: {
          ...realisticSummary.rosterSnapshot!,
          playersById: { p1: undefined, p2: 'Bob', p3: undefined }
        }
      };

      const result = deriveCanonicalRosterSnapshot(summaryWithMissingNames, realisticGameState);

      expect(result.playersById).toEqual({
        p1: 'Alice', // From state
        p2: 'Bob',   // From snapshot
        p3: 'Charlie' // From state
      });
    });

    it('should handle empty state gracefully', () => {
      const emptyState: AppState = {
        players: {},
        playerDetails: {},
        scores: {},
        sp: { phase: 'setup', roundNo: null, order: [] }
      };

      const result = deriveCanonicalRosterSnapshot({}, emptyState);

      expect(result.rosterId).toBeNull();
      expect(result.playersById).toEqual({});
      expect(result.playerTypesById).toEqual({});
      expect(result.displayOrder).toEqual({});
    });

    it('should handle state with only SP order', () => {
      const stateWithSpOrder = {
        ...realisticGameState,
        players: {},
        playerDetails: {}
      };

      const result = deriveCanonicalRosterSnapshot({}, stateWithSpOrder);

      expect(result.playersById).toEqual({
        p1: 'p1',
        p2: 'p2',
        p3: 'p3'
      });
      expect(result.displayOrder).toEqual({
        p1: 0,
        p2: 1,
        p3: 2
      });
    });
  });

  describe('createAliasResolver', () => {
    it('should resolve canonical player IDs directly', () => {
      const snapshot = deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState);
      const resolver = createAliasResolver(snapshot, realisticSummary, realisticGameState);

      expect(resolver.resolve('p1')).toBe('p1');
      expect(resolver.resolve('p2')).toBe('p2');
      expect(resolver.resolve('p3')).toBe('p3');
    });

    it('should resolve player names to canonical IDs', () => {
      const snapshot = deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState);
      const resolver = createAliasResolver(snapshot, realisticSummary, realisticGameState);

      expect(resolver.resolve('Alice')).toBe('p1');
      expect(resolver.resolve('Bob')).toBe('p2');
      expect(resolver.resolve('Charlie')).toBe('p3');
    });

    it('should resolve position-based aliases', () => {
      const snapshot = deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState);
      const resolver = createAliasResolver(snapshot, realisticSummary, realisticGameState);

      expect(resolver.resolve('player 1')).toBe('p1');
      expect(resolver.resolve('player1')).toBe('p1');
      expect(resolver.resolve('p1')).toBe('p1');
      expect(resolver.resolve('player 2')).toBe('p2');
      expect(resolver.resolve('player2')).toBe('p2');
      expect(resolver.resolve('p2')).toBe('p2');
    });

    it('should resolve slot mapping aliases', () => {
      const snapshot = deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState);
      const resolver = createAliasResolver(snapshot, realisticSummary, realisticGameState);

      expect(resolver.resolve('alice')).toBe('p1');
      expect(resolver.resolve('bob')).toBe('p2');
      expect(resolver.resolve('charlie')).toBe('p3');
    });

    it('should use fallback name for resolution', () => {
      const snapshot = deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState);
      const resolver = createAliasResolver(snapshot, realisticSummary, realisticGameState);

      expect(resolver.resolve('unknown_id', 'Alice')).toBe('p1');
      expect(resolver.resolve('unknown_id', 'Bob')).toBe('p2');
      expect(resolver.resolve('unknown_id', 'NonExistent')).toBeNull();
    });

    it('should handle case-insensitive aliases', () => {
      const snapshot = deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState);
      const resolver = createAliasResolver(snapshot, realisticSummary, realisticGameState);

      expect(resolver.resolve('ALICE')).toBe('p1');
      expect(resolver.resolve('bob')).toBe('p2');
      expect(resolver.resolve('PLAYER 1')).toBe('p1');
    });

    it('should return null for unknown aliases', () => {
      const snapshot = deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState);
      const resolver = createAliasResolver(snapshot, realisticSummary, realisticGameState);

      expect(resolver.resolve('unknown_player')).toBeNull();
      expect(resolver.resolve('player 99')).toBeNull();
      expect(resolver.resolve('')).toBeNull();
      expect(resolver.resolve(null as any)).toBeNull();
    });

    it('should handle malformed aliases gracefully', () => {
      const snapshot = deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState);
      const resolver = createAliasResolver(snapshot, realisticSummary, realisticGameState);

      expect(resolver.resolve(123 as any)).toBeNull();
      expect(resolver.resolve({} as any)).toBeNull();
      expect(resolver.resolve([] as any)).toBeNull();
    });

    it('should work when no display order is defined', () => {
      const snapshotWithoutOrder = {
        ...deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState),
        displayOrder: {}
      };
      const resolver = createAliasResolver(snapshotWithoutOrder, realisticSummary, realisticGameState);

      // Should still register position-based aliases based on canonical ID order
      expect(resolver.resolve('player 1')).toBe('p1');
      expect(resolver.resolve('player 2')).toBe('p2');
      expect(resolver.resolve('player 3')).toBe('p3');
    });
  });

  describe('canonicalizeScores', () => {
    it('should canonicalize scores with alias resolution', () => {
      const snapshot = deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState);
      const resolver = createAliasResolver(snapshot, realisticSummary, realisticGameState);

      const originalScores = {
        'p1': 100,
        'Bob': 85,
        'player 3': 92,
        'unknown_player': 50
      };

      const result = canonicalizeScores(originalScores, resolver.resolve, realisticSummary.players);

      expect(result).toEqual({
        p1: 100,    // Direct match
        p2: 85,     // Resolved from 'Bob'
        p3: 92      // Resolved from 'player 3'
        // unknown_player ignored
      });
    });

    it('should sum scores for multiple entries of same canonical player', () => {
      const snapshot = deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState);
      const resolver = createAliasResolver(snapshot, realisticSummary, realisticGameState);

      const originalScores = {
        'p1': 50,
        'Alice': 30,
        'player 1': 20,
        'p2': 40,
        'Bob': 10
      };

      const result = canonicalizeScores(originalScores, resolver.resolve, realisticSummary.players);

      expect(result).toEqual({
        p1: 100, // 50 + 30 + 20
        p2: 50   // 40 + 10
      });
    });

    it('should handle string scores', () => {
      const snapshot = deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState);
      const resolver = createAliasResolver(snapshot, realisticSummary, realisticGameState);

      const originalScores = {
        'p1': '100',
        'p2': '85.5',
        'p3': '92'
      };

      const result = canonicalizeScores(originalScores, resolver.resolve, realisticSummary.players);

      expect(result).toEqual({
        p1: 100,
        p2: 85.5,
        p3: 92
      });
    });

    it('should ignore invalid scores', () => {
      const snapshot = deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState);
      const resolver = createAliasResolver(snapshot, realisticSummary, realisticGameState);

      const originalScores = {
        'p1': 100,
        'p2': 'invalid',
        'p3': NaN,
        'Bob': Infinity,
        'unknown_player': 50
      };

      const result = canonicalizeScores(originalScores, resolver.resolve, realisticSummary.players);

      expect(result).toEqual({
        p1: 100
        // All invalid scores ignored
      });
    });

    it('should handle empty scores', () => {
      const snapshot = deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState);
      const resolver = createAliasResolver(snapshot, realisticSummary, realisticGameState);

      const result = canonicalizeScores(undefined, resolver.resolve, realisticSummary.players);

      expect(result).toEqual({});
    });

    it('should handle null player namesById', () => {
      const snapshot = deriveCanonicalRosterSnapshot(realisticSummary, realisticGameState);
      const resolver = createAliasResolver(snapshot, realisticSummary, realisticGameState);

      const originalScores = {
        'p1': 100,
        'p2': 85
      };

      const result = canonicalizeScores(originalScores, resolver.resolve, null);

      expect(result).toEqual({
        p1: 100,
        p2: 85
      });
    });
  });
});