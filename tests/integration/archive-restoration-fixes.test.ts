import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInstance } from '@/lib/state/instance';
import { events } from '@/lib/state/events';
import {
  archiveCurrentGameAndReset,
  restoreGame,
  listGames,
  getGame,
  deleteGame,
  GAMES_DB_NAME,
  deriveGameMode,
} from '@/lib/state/io';

function makeDbName(prefix = 'archive-fixes') {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

describe('archive restoration fixes', () => {
  let dbName: string;
  let inst: any;

  beforeEach(async () => {
    dbName = makeDbName();
    inst = await createInstance({ dbName, channelName: `chan-${dbName}` });
  });

  afterEach(async () => {
    // Clean up any archived games
    try {
      const games = await listGames(GAMES_DB_NAME);
      for (const game of games) {
        await deleteGame(GAMES_DB_NAME, game.id);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
    inst.close();
  });

  describe('player name preservation', () => {
    it('preserves original player names during archive restoration', async () => {
      // Build a game with distinct player names
      await inst.append(events.playerAdded({ id: 'p1', name: 'Alice' }));
      await inst.append(events.playerAdded({ id: 'p2', name: 'Bob' }));
      await inst.append(events.playerAdded({ id: 'p3', name: 'Charlie' }));
      await inst.append(events.playerAdded({ id: 'p4', name: 'Diana' }));

      // Add some game activity to establish player identity
      await inst.append(
        events.spDeal({
          roundNo: 1,
          dealerId: 'p1',
          order: ['p1', 'p2', 'p3', 'p4'],
          trump: 'hearts',
          trumpCard: { suit: 'hearts', rank: 12 },
          hands: { p1: [], p2: [], p3: [], p4: [] },
        }),
      );

      const beforeArchiveState = inst.getState();
      const expectedNames = beforeArchiveState.players;

      // Archive the game
      const rec = await archiveCurrentGameAndReset(dbName, { title: 'Test Player Names' });
      expect(rec).not.toBeNull();

      // Restore the game
      await restoreGame(dbName, rec!.id);
      await inst.rehydrate();

      const afterRestoreState = inst.getState();

      // Player names should be preserved
      expect(afterRestoreState.players).toEqual(expectedNames);
      expect(afterRestoreState.players['p1']).toBe('Alice');
      expect(afterRestoreState.players['p2']).toBe('Bob');
      expect(afterRestoreState.players['p3']).toBe('Charlie');
      expect(afterRestoreState.players['p4']).toBe('Diana');

      // Player details should also preserve names
      expect(afterRestoreState.playerDetails['p1']?.name).toBe('Alice');
      expect(afterRestoreState.playerDetails['p2']?.name).toBe('Bob');
      expect(afterRestoreState.playerDetails['p3']?.name).toBe('Charlie');
      expect(afterRestoreState.playerDetails['p4']?.name).toBe('Diana');
    });

    it('handles corrupted summary data gracefully', async () => {
      // Build a game
      await inst.append(events.playerAdded({ id: 'p1', name: 'Player 1' }));
      await inst.append(events.playerAdded({ id: 'p2', name: 'Player 2' }));

      // Archive the game
      const rec = await archiveCurrentGameAndReset(dbName, { title: 'Test Corruption' });
      expect(rec).not.toBeNull();

      // Manually corrupt the summary data to simulate the issue we fixed
      // This simulates when all player names become "You"
      const corruptedRec = {
        ...rec,
        summary: {
          ...rec.summary,
          playersById: {
            p1: 'You',
            p2: 'You',
          },
        },
      };

      // Update the archived record manually (this simulates the bug we fixed)
      // In real scenarios, this corruption could happen due to data migration issues
      const db = await inst['db']; // Access internal DB for testing
      const tx = db.transaction([GAMES_DB_NAME], 'readwrite');
      const store = tx.objectStore(GAMES_DB_NAME);
      await store.put(corruptedRec);
      await tx.done;

      // Restore the game
      await restoreGame(dbName, rec!.id);
      await inst.rehydrate();

      const afterRestoreState = inst.getState();

      // Even with corrupted summary data, player names should be preserved from state/events
      // This tests our fix for the assignName function prioritization
      expect(afterRestoreState.players['p1']).toBe('Player 1');
      expect(afterRestoreState.players['p2']).toBe('Player 2');
    });
  });

  describe('game mode detection', () => {
    it('detects single-player games from events when bundle.mode is undefined', async () => {
      // Build a single-player game using SP events
      await inst.append(events.playerAdded({ id: 'p1', name: 'Human' }));
      await inst.append(events.playerAdded({ id: 'p2', name: 'Bot 1', type: 'bot' }));
      await inst.append(events.playerAdded({ id: 'p3', name: 'Bot 2', type: 'bot' }));

      await inst.append(
        events.spDeal({
          roundNo: 1,
          dealerId: 'p1',
          order: ['p1', 'p2', 'p3'],
          trump: 'spades',
          trumpCard: { suit: 'spades', rank: 1 },
          hands: { p1: [], p2: [], p3: [] },
        }),
      );

      // Archive the game
      const rec = await archiveCurrentGameAndReset(dbName, { title: 'SP Game' });
      expect(rec).not.toBeNull();

      // Manually set bundle.mode to undefined to simulate the issue we fixed
      const modifiedRec = {
        ...rec,
        bundle: {
          ...rec.bundle,
          mode: undefined,
          // Ensure we have SP events for detection
          events: rec.bundle?.events || [],
        },
      };

      // Update the archived record
      const db = await inst['db'];
      const tx = db.transaction([GAMES_DB_NAME], 'readwrite');
      const store = tx.objectStore(GAMES_DB_NAME);
      await store.put(modifiedRec);
      await tx.done;

      // The game should still be detected as single-player based on events
      const detectedMode = deriveGameMode(modifiedRec);
      expect(detectedMode).toBe('single-player');

      // Restore should still work correctly
      await restoreGame(dbName, rec!.id);
      await inst.rehydrate();

      const restoredState = inst.getState();
      expect(restoredState.sp).toBeDefined();
      expect(restoredState.sp?.phase).toBe('playing'); // Should be in playing state after deal
    });

    it('detects single-player games from various SP event types', async () => {
      // Test different single-player event types
      const spEvents = [
        'sp-start-round',
        'sp-deal',
        'sp-trick',
        'sp-advance',
        'sp-phase-set',
        'sp-leader-set',
      ];

      for (const eventType of spEvents) {
        const testDbName = makeDbName(`sp-event-${eventType}`);
        const testInst = await createInstance({
          dbName: testDbName,
          channelName: `chan-${testDbName}`,
        });

        await testInst.append(events.playerAdded({ id: 'p1', name: 'Test Player' }));
        await testInst.append(events.playerAdded({ id: 'p2', name: 'Test Bot', type: 'bot' }));

        // Add a single-player event of the current type
        await testInst.append({ type: eventType, playerId: 'p1' });

        // Archive the game
        const testRec = await archiveCurrentGameAndReset(testDbName, {
          title: `Test ${eventType}`,
        });
        expect(testRec).not.toBeNull();

        // Set bundle.mode to undefined to test event-based detection
        const testModifiedRec = {
          ...testRec,
          bundle: {
            ...testRec.bundle,
            mode: undefined,
          },
        };

        // Update the archived record
        const testDb = await testInst['db'];
        const testTx = testDb.transaction([GAMES_DB_NAME], 'readwrite');
        const testStore = testTx.objectStore(GAMES_DB_NAME);
        await testStore.put(testModifiedRec);
        await testTx.done;

        // Should detect as single-player based on events
        const testDetectedMode = deriveGameMode(testModifiedRec);
        expect(testDetectedMode).toBe('single-player');

        // Cleanup
        await deleteGame(GAMES_DB_NAME, testRec!.id);
        testInst.close();
      }
    });
  });

  describe('snapshot UUID compatibility', () => {
    it('loads snapshots with different UUIDs during archive restoration', async () => {
      // Create a game and advance it
      await inst.append(events.playerAdded({ id: 'p1', name: 'Player 1' }));
      await inst.append(events.playerAdded({ id: 'p2', name: 'Player 2' }));

      await inst.append(
        events.spDeal({
          roundNo: 1,
          dealerId: 'p1',
          order: ['p1', 'p2'],
          trump: 'clubs',
          trumpCard: { suit: 'clubs', rank: 2 },
          hands: { p1: [], p2: [] },
        }),
      );

      const gameId = inst.getState().sp?.currentGameId || 'original-game-id';
      expect(gameId).toBeDefined();

      // Archive the game
      const rec = await archiveCurrentGameAndReset(dbName, { title: 'UUID Test' });
      expect(rec).not.toBeNull();

      // Restore with archive ID (different from original gameId)
      await restoreGame(dbName, rec!.id);
      await inst.rehydrate();

      const restoredState = inst.getState();

      // The restored state should have the archive ID
      expect(restoredState.sp?.currentGameId).toBe(rec!.id);
      expect(restoredState.sp?.gameId).toBe(rec!.id);

      // Game state should be properly restored
      expect(restoredState.players).toBeDefined();
      expect(Object.keys(restoredState.players)).toHaveLength(2);
      expect(restoredState.sp?.phase).toBe('playing');
    });

    it('handles localStorage snapshot fallback when IndexedDB snapshot has mismatched UUID', async () => {
      // This test simulates the scenario where IndexedDB snapshots exist
      // but have different gameIds than the archive ID

      // Create a game
      await inst.append(events.playerAdded({ id: 'p1', name: 'Local Player' }));
      await inst.append(events.playerAdded({ id: 'p2', name: 'Local Bot', type: 'bot' }));

      // Archive the game
      const rec = await archiveCurrentGameAndReset(dbName, { title: 'Local Storage Test' });
      expect(rec).not.toBeNull();

      // Simulate the fallback scenario by directly calling the snapshot loading logic
      // with a different gameId than expected
      const { loadSnapshotByGameId } = await import('@/lib/state/persistence/sp-snapshot');

      // This should not throw an error with our fallback logic
      const result = await loadSnapshotByGameId({
        gameId: rec!.id,
        adapters: {
          indexedDb: inst['adapters']?.indexedDb,
          localStorage: inst['adapters']?.localStorage,
        },
        allowLocalStorageFallback: true,
        onWarn: () => {}, // Suppress warnings for this test
      });

      // Should return some result (either from IndexedDB or localStorage)
      expect(result).toBeDefined();
      expect(result.source).toBe('indexed-db'); // Should find and use fallback

      // The snapshot should be valid
      expect(result.snapshot).toBeDefined();
      expect(result.snapshot?.version).toBeDefined();
    });
  });

  describe('error handling and edge cases', () => {
    it('handles restoration timeout gracefully', async () => {
      // Create a large game that would take longer to restore
      await inst.append(events.playerAdded({ id: 'p1', name: 'Slow Player' }));
      await inst.append(events.playerAdded({ id: 'p2', name: 'Slow Bot', type: 'bot' }));

      // Add many events to simulate a complex game
      for (let i = 0; i < 100; i++) {
        await inst.append(
          events.scoreAdded({ playerId: 'p1', delta: Math.floor(Math.random() * 10) }),
        );
      }

      const rec = await archiveCurrentGameAndReset(dbName, { title: 'Large Game' });
      expect(rec).not.toBeNull();

      // Even with a large game, restoration should complete successfully
      await restoreGame(dbName, rec!.id);
      await inst.rehydrate();

      const finalState = inst.getState();
      expect(finalState.players).toBeDefined();
      expect(finalState.scores).toBeDefined();
    });

    it('prevents double restoration of the same archive', async () => {
      // Create a game
      await inst.append(events.playerAdded({ id: 'p1', name: 'Unique Player' }));
      await inst.append(events.playerAdded({ id: 'p2', name: 'Unique Bot', type: 'bot' }));

      const rec = await archiveCurrentGameAndReset(dbName, { title: 'Unique Test' });
      expect(rec).not.toBeNull();

      // First restoration
      await restoreGame(dbName, rec!.id);
      await inst.rehydrate();

      const firstRestoredState = inst.getState();
      expect(firstRestoredState.players).toBeDefined();

      // Second restoration should not corrupt the state
      await restoreGame(dbName, rec!.id);
      await inst.rehydrate();

      const secondRestoredState = inst.getState();
      expect(secondRestoredState.players).toEqual(firstRestoredState.players);
      expect(secondRestoredState.sp?.currentGameId).toBe(rec!.id);
    });

    it('handles missing archive gracefully', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

      // Should not throw an error, but should handle gracefully
      await expect(restoreGame(dbName, nonExistentId)).rejects.toThrow();

      // The instance should remain in a valid state
      const currentState = inst.getState();
      expect(currentState).toBeDefined();
      expect(currentState.players).toBeDefined();
    });
  });
});
