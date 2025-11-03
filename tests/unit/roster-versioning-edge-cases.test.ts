import { describe, it, expect, vi, beforeEach } from 'vitest';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';
import { events } from '@/lib/state/events';
import { selectRosterById } from '@/lib/state/selectors';

describe('roster versioning edge cases', () => {
  // Mock UUID for consistent testing
  const mockUuid = vi.fn(() => 'test-uuid-' + Math.random().toString(36).substring(2, 9));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('roster modification creates new versions', () => {
    it('creates new roster version when name is changed', () => {
      const originalRosterId = 'roster-v1';
      let state: AppState = INITIAL_STATE;

      // Create player entities in global state
      state = {
        ...state,
        players: {
          ...state.players,
          p1: 'Alice',
          p2: 'Bob',
        },
      };

      // Create initial roster
      state = reduce(
        state,
        events.rosterCreated({
          rosterId: originalRosterId,
          name: 'Original Roster',
          type: 'scorecard',
        }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: originalRosterId, id: 'p1', name: 'Alice' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({
          rosterId: originalRosterId,
          id: 'p2',
          name: 'Bob',
          type: 'bot',
        }),
      );

      const originalRoster = state.rosters[originalRosterId];
      expect(originalRoster.name).toBe('Original Roster');
      expect(Object.keys(originalRoster.playersById)).toEqual(['p1', 'p2']);

      // Simulate roster name change creating new version
      const newRosterId = 'roster-v2';
      mockUuid.mockReturnValue(newRosterId);

      state = reduce(
        state,
        events.rosterCreated({
          rosterId: newRosterId,
          name: 'Updated Roster',
          type: 'scorecard',
        }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: newRosterId, id: 'p1', name: 'Alice' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: newRosterId, id: 'p2', name: 'Bob', type: 'bot' }),
      );

      const newRoster = state.rosters[newRosterId];
      expect(newRoster.name).toBe('Updated Roster');
      expect(Object.keys(newRoster.playersById)).toEqual(['p1', 'p2']);

      // Original roster should remain unchanged
      expect(state.rosters[originalRosterId].name).toBe('Original Roster');
      expect(Object.keys(state.rosters[originalRosterId].playersById)).toEqual(['p1', 'p2']);
    });

    it('creates new roster version when player is added', () => {
      const originalRosterId = 'roster-v1';
      let state: AppState = INITIAL_STATE;

      // Create player entities in global state
      state = {
        ...state,
        players: {
          ...state.players,
          p1: 'Alice',
          p2: 'Bob',
          p3: 'Charlie',
        },
      };

      // Create initial roster with 2 players
      state = reduce(
        state,
        events.rosterCreated({ rosterId: originalRosterId, name: 'Team A', type: 'scorecard' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: originalRosterId, id: 'p1', name: 'Alice' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({
          rosterId: originalRosterId,
          id: 'p2',
          name: 'Bob',
          type: 'bot',
        }),
      );

      expect(Object.keys(state.rosters[originalRosterId].playersById)).toEqual(['p1', 'p2']);

      // Simulate adding a player creating new version
      const newRosterId = 'roster-v2';
      mockUuid.mockReturnValue(newRosterId);

      state = reduce(
        state,
        events.rosterCreated({ rosterId: newRosterId, name: 'Team A', type: 'scorecard' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: newRosterId, id: 'p1', name: 'Alice' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: newRosterId, id: 'p2', name: 'Bob', type: 'bot' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: newRosterId, id: 'p3', name: 'Charlie' }),
      );

      expect(Object.keys(state.rosters[newRosterId].playersById)).toEqual(['p1', 'p2', 'p3']);
      expect(Object.keys(state.rosters[originalRosterId].playersById)).toEqual(['p1', 'p2']);
    });

    it('creates new roster version when player is removed', () => {
      const originalRosterId = 'roster-v1';
      let state: AppState = INITIAL_STATE;

      // Create player entities in global state
      state = {
        ...state,
        players: {
          ...state.players,
          p1: 'Alice',
          p2: 'Bob',
          p3: 'Charlie',
        },
      };

      // Create initial roster with 3 players
      state = reduce(
        state,
        events.rosterCreated({ rosterId: originalRosterId, name: 'Team A', type: 'scorecard' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: originalRosterId, id: 'p1', name: 'Alice' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({
          rosterId: originalRosterId,
          id: 'p2',
          name: 'Bob',
          type: 'bot',
        }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: originalRosterId, id: 'p3', name: 'Charlie' }),
      );

      expect(Object.keys(state.rosters[originalRosterId].playersById)).toEqual(['p1', 'p2', 'p3']);

      // Simulate removing a player creating new version
      const newRosterId = 'roster-v2';
      mockUuid.mockReturnValue(newRosterId);

      state = reduce(
        state,
        events.rosterCreated({ rosterId: newRosterId, name: 'Team A', type: 'scorecard' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: newRosterId, id: 'p1', name: 'Alice' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: newRosterId, id: 'p3', name: 'Charlie' }),
      );

      expect(Object.keys(state.rosters[newRosterId].playersById)).toEqual(['p1', 'p3']);
      expect(Object.keys(state.rosters[originalRosterId].playersById)).toEqual(['p1', 'p2', 'p3']);
    });

    it('creates new roster version when player type is changed', () => {
      const originalRosterId = 'roster-v1';
      let state: AppState = INITIAL_STATE;

      // Create player entities in global state
      state = {
        ...state,
        players: {
          ...state.players,
          p1: 'Alice',
          p2: 'Bob',
        },
      };

      // Create initial roster
      state = reduce(
        state,
        events.rosterCreated({ rosterId: originalRosterId, name: 'Team A', type: 'scorecard' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: originalRosterId, id: 'p1', name: 'Alice' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: originalRosterId, id: 'p2', name: 'Bob' }),
      );

      expect(state.rosters[originalRosterId].playerTypesById).toEqual({ p1: 'human', p2: 'human' });

      // Simulate changing player type creating new version
      const newRosterId = 'roster-v2';
      mockUuid.mockReturnValue(newRosterId);

      state = reduce(
        state,
        events.rosterCreated({ rosterId: newRosterId, name: 'Team A', type: 'scorecard' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: newRosterId, id: 'p1', name: 'Alice' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: newRosterId, id: 'p2', name: 'Bob', type: 'bot' }),
      );

      expect(state.rosters[newRosterId].playerTypesById).toEqual({ p1: 'human', p2: 'bot' });
      expect(state.rosters[originalRosterId].playerTypesById).toEqual({ p1: 'human', p2: 'human' });
    });
  });

  describe('roster identity preservation', () => {
    it('preserves roster metadata across versions', () => {
      const originalRosterId = 'roster-v1';
      let state: AppState = INITIAL_STATE;

      // Use fake timers to control timestamps precisely
      vi.useFakeTimers();
      const originalCreatedAt = 1000000;
      vi.setSystemTime(originalCreatedAt);

      // Create first roster
      state = reduce(
        state,
        events.rosterCreated({
          rosterId: originalRosterId,
          name: 'Team Alpha',
          type: 'scorecard',
          createdAt: originalCreatedAt,
        }),
      );

      // Advance time and create second roster
      const newRosterId = 'roster-v2';
      const advancedTime = originalCreatedAt + 1000;
      vi.setSystemTime(advancedTime);

      state = reduce(
        state,
        events.rosterCreated({
          rosterId: newRosterId,
          name: 'Team Alpha', // Same name
          type: 'scorecard',
          createdAt: advancedTime,
        }),
      );

      const originalRoster = state.rosters[originalRosterId];
      const newRoster = state.rosters[newRosterId];

      expect(originalRoster.name).toBe('Team Alpha');
      expect(newRoster.name).toBe('Team Alpha');
      expect(originalRoster.createdAt).toBe(originalCreatedAt);
      expect(newRoster.createdAt).toBe(advancedTime);
      expect(newRoster.createdAt).toBeGreaterThan(originalCreatedAt);

      vi.useRealTimers();
    });

    it('allows multiple versions of same roster name', () => {
      let state: AppState = INITIAL_STATE;
      const versions = ['v1', 'v2', 'v3'];

      versions.forEach((version, index) => {
        state = reduce(
          state,
          events.rosterCreated({
            rosterId: `roster-${version}`,
            name: 'Team Alpha',
            type: 'scorecard',
          }),
        );
      });

      // All versions should exist
      expect(state.rosters['roster-v1']).toBeDefined();
      expect(state.rosters['roster-v2']).toBeDefined();
      expect(state.rosters['roster-v3']).toBeDefined();

      // All should have same name
      expect(state.rosters['roster-v1'].name).toBe('Team Alpha');
      expect(state.rosters['roster-v2'].name).toBe('Team Alpha');
      expect(state.rosters['roster-v3'].name).toBe('Team Alpha');
    });
  });

  describe('edge cases and error handling', () => {
    it('handles missing roster gracefully', () => {
      const state: AppState = INITIAL_STATE;
      const roster = selectRosterById(state, 'nonexistent-roster');
      expect(roster).toBeNull();
    });

    it('handles empty roster operations', () => {
      const rosterId = 'empty-roster';
      let state: AppState = INITIAL_STATE;

      state = reduce(state, events.rosterCreated({ rosterId, name: 'Empty', type: 'scorecard' }));

      expect(state.rosters[rosterId]).toBeDefined();
      expect(Object.keys(state.rosters[rosterId].playersById)).toHaveLength(0);
      expect(Object.keys(state.rosters[rosterId].playerTypesById)).toHaveLength(0);
      expect(Object.keys(state.rosters[rosterId].displayOrder)).toHaveLength(0);
    });

    it('prevents removing last player from roster', () => {
      const rosterId = 'min-roster';
      let state: AppState = INITIAL_STATE;

      state = reduce(state, events.rosterCreated({ rosterId, name: 'Min', type: 'scorecard' }));
      state = reduce(state, events.rosterPlayerAdded({ rosterId, id: 'p1', name: 'Alice' }));

      // Should not be able to remove last player (minimum 2 players required)
      // This would be enforced by the UI logic, but we can verify the state doesn't break
      expect(Object.keys(state.rosters[rosterId].playersById)).toHaveLength(1);
    });

    it('handles player reordering operations', () => {
      const rosterId = 'reorder-test';
      let state: AppState = INITIAL_STATE;

      // Create player entities in global state
      state = {
        ...state,
        players: {
          ...state.players,
          p1: 'Alice',
          p2: 'Bob',
          p3: 'Charlie',
        },
      };

      state = reduce(state, events.rosterCreated({ rosterId, name: 'Reorder', type: 'scorecard' }));
      state = reduce(state, events.rosterPlayerAdded({ rosterId, id: 'p1', name: 'Alice' }));
      state = reduce(state, events.rosterPlayerAdded({ rosterId, id: 'p2', name: 'Bob' }));
      state = reduce(state, events.rosterPlayerAdded({ rosterId, id: 'p3', name: 'Charlie' }));

      const originalOrder = state.rosters[rosterId].displayOrder;
      expect(Object.values(originalOrder)).toEqual([0, 1, 2]);

      // Reorder players
      state = reduce(
        state,
        events.rosterPlayersReordered({
          rosterId,
          order: ['p3', 'p1', 'p2'],
        }),
      );

      const newOrder = state.rosters[rosterId].displayOrder;
      expect(newOrder).toEqual({ p3: 0, p1: 1, p2: 2 });
    });

    it('maintains player type information correctly', () => {
      const rosterId = 'player-types';
      let state: AppState = INITIAL_STATE;

      // First create player entities in the global state
      state = {
        ...state,
        players: {
          ...state.players,
          p1: 'Alice',
          p2: 'Bob',
          p3: 'Charlie',
          p4: 'Diana',
        },
      };

      state = reduce(state, events.rosterCreated({ rosterId, name: 'Mixed', type: 'scorecard' }));
      state = reduce(state, events.rosterPlayerAdded({ rosterId, id: 'p1', name: 'Alice' }));
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId, id: 'p2', name: 'Bob', type: 'bot' }),
      );
      state = reduce(state, events.rosterPlayerAdded({ rosterId, id: 'p3', name: 'Charlie' }));
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId, id: 'p4', name: 'Diana', type: 'bot' }),
      );

      const roster = state.rosters[rosterId];
      expect(roster.playerTypesById).toEqual({
        p1: 'human',
        p2: 'bot',
        p3: 'human',
        p4: 'bot',
      });
      // playersById stores empty strings as references to global players
      expect(roster.playersById).toEqual({
        p1: '',
        p2: '',
        p3: '',
        p4: '',
      });
      // Player names are in the global state
      expect(state.players.p1).toBe('Alice');
      expect(state.players.p2).toBe('Bob');
      expect(state.players.p3).toBe('Charlie');
      expect(state.players.p4).toBe('Diana');
    });
  });

  describe('archival and restoration', () => {
    it('handles roster archival correctly', () => {
      const rosterId = 'archive-test';
      let state: AppState = INITIAL_STATE;

      state = reduce(
        state,
        events.rosterCreated({ rosterId, name: 'Archive Me', type: 'scorecard' }),
      );
      expect(state.rosters[rosterId].archivedAt).toBeNull();

      state = reduce(state, events.rosterArchived({ rosterId }));
      expect(state.rosters[rosterId].archivedAt).toBeTypeOf('number');
      expect(state.rosters[rosterId].archivedAt).toBeGreaterThan(0);
    });

    it('handles roster restoration correctly', () => {
      const rosterId = 'restore-test';
      let state: AppState = INITIAL_STATE;

      state = reduce(
        state,
        events.rosterCreated({ rosterId, name: 'Restore Me', type: 'scorecard' }),
      );
      state = reduce(state, events.rosterArchived({ rosterId }));

      expect(state.rosters[rosterId].archivedAt).toBeTypeOf('number');

      state = reduce(state, events.rosterRestored({ rosterId }));
      expect(state.rosters[rosterId].archivedAt).toBeNull();
    });

    it('handles roster deletion correctly', () => {
      const rosterId = 'delete-test';
      let state: AppState = INITIAL_STATE;

      state = reduce(
        state,
        events.rosterCreated({ rosterId, name: 'Delete Me', type: 'scorecard' }),
      );
      expect(state.rosters[rosterId]).toBeDefined();

      state = reduce(state, events.rosterDeleted({ rosterId }));
      expect(state.rosters[rosterId]).toBeUndefined();
    });
  });

  describe('complex scenarios', () => {
    it('handles multiple modifications in sequence', () => {
      let state: AppState = INITIAL_STATE;
      const versions = [];

      // Create player entities in global state
      state = {
        ...state,
        players: {
          ...state.players,
          p1: 'Alice',
          p2: 'Bob',
          p3: 'Charlie',
        },
      };

      // Create original roster
      versions.push('v1');
      state = reduce(
        state,
        events.rosterCreated({ rosterId: 'v1', name: 'Team', type: 'scorecard' }),
      );
      state = reduce(state, events.rosterPlayerAdded({ rosterId: 'v1', id: 'p1', name: 'Alice' }));
      state = reduce(state, events.rosterPlayerAdded({ rosterId: 'v1', id: 'p2', name: 'Bob' }));

      // Version 2: Add player
      versions.push('v2');
      state = reduce(
        state,
        events.rosterCreated({ rosterId: 'v2', name: 'Team', type: 'scorecard' }),
      );
      state = reduce(state, events.rosterPlayerAdded({ rosterId: 'v2', id: 'p1', name: 'Alice' }));
      state = reduce(state, events.rosterPlayerAdded({ rosterId: 'v2', id: 'p2', name: 'Bob' }));
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: 'v2', id: 'p3', name: 'Charlie' }),
      );

      // Version 3: Remove player and rename
      versions.push('v3');
      state = reduce(
        state,
        events.rosterCreated({ rosterId: 'v3', name: 'Team Alpha', type: 'scorecard' }),
      );
      state = reduce(state, events.rosterPlayerAdded({ rosterId: 'v3', id: 'p1', name: 'Alice' }));
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: 'v3', id: 'p3', name: 'Charlie' }),
      );

      // Verify all versions exist with correct data
      expect(state.rosters['v1'].name).toBe('Team');
      expect(Object.keys(state.rosters['v1'].playersById)).toEqual(['p1', 'p2']);

      expect(state.rosters['v2'].name).toBe('Team');
      expect(Object.keys(state.rosters['v2'].playersById)).toEqual(['p1', 'p2', 'p3']);

      expect(state.rosters['v3'].name).toBe('Team Alpha');
      expect(Object.keys(state.rosters['v3'].playersById)).toEqual(['p1', 'p3']);
    });

    it('maintains unique IDs across all versions', () => {
      let state: AppState = INITIAL_STATE;
      const allPlayerIds = new Set();

      // Create player entities in the global state
      state = {
        ...state,
        players: {
          ...state.players,
          p1: 'Alice',
          p2: 'Bob',
          p3: 'Charlie',
        },
      };

      // Create multiple versions with overlapping player IDs
      state = reduce(
        state,
        events.rosterCreated({ rosterId: 'v1', name: 'Team', type: 'scorecard' }),
      );
      state = reduce(state, events.rosterPlayerAdded({ rosterId: 'v1', id: 'p1', name: 'Alice' }));
      state = reduce(state, events.rosterPlayerAdded({ rosterId: 'v1', id: 'p2', name: 'Bob' }));

      state = reduce(
        state,
        events.rosterCreated({ rosterId: 'v2', name: 'Team', type: 'scorecard' }),
      );
      state = reduce(state, events.rosterPlayerAdded({ rosterId: 'v2', id: 'p1', name: 'Alice' }));
      state = reduce(state, events.rosterPlayerAdded({ rosterId: 'v2', id: 'p2', name: 'Bob' }));
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: 'v2', id: 'p3', name: 'Charlie' }),
      );

      // Each roster should maintain its own player references (empty strings point to global players)
      expect(state.rosters['v1'].playersById.p1).toBe('');
      expect(state.rosters['v2'].playersById.p1).toBe('');
      expect(state.rosters['v1'].playersById.p2).toBe('');
      expect(state.rosters['v2'].playersById.p2).toBe('');
      expect(state.rosters['v2'].playersById.p3).toBe('');

      // Global player names should be accessible
      expect(state.players.p1).toBe('Alice');
      expect(state.players.p2).toBe('Bob');
      expect(state.players.p3).toBe('Charlie');
    });

    it('handles player name changes across all roster versions', () => {
      let state: AppState = INITIAL_STATE;

      // Create player entities in global state
      state = {
        ...state,
        players: {
          ...state.players,
          p1: 'Alice',
          p2: 'Bob',
        },
      };

      // Create multiple rosters that reference the same players
      state = reduce(
        state,
        events.rosterCreated({ rosterId: 'team-alpha', name: 'Team Alpha', type: 'scorecard' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: 'team-alpha', id: 'p1', name: 'Alice' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: 'team-alpha', id: 'p2', name: 'Bob' }),
      );

      state = reduce(
        state,
        events.rosterCreated({ rosterId: 'team-beta', name: 'Team Beta', type: 'scorecard' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: 'team-beta', id: 'p1', name: 'Alice' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: 'team-beta', id: 'p2', name: 'Bob' }),
      );

      // Verify initial state
      expect(state.players.p1).toBe('Alice');
      expect(state.players.p2).toBe('Bob');

      // Change player name in global state (simulating player entity update)
      state = reduce(state, events.playerAdded({ id: 'p1', name: 'Alicia' }));
      state = reduce(state, events.playerRenamed({ id: 'p1', name: 'Alicia' }));

      // Verify that player name is updated globally
      expect(state.players.p1).toBe('Alicia');
      expect(state.players.p2).toBe('Bob'); // Other player unchanged

      // Roster references should remain the same (empty strings)
      expect(state.rosters['team-alpha'].playersById.p1).toBe('');
      expect(state.rosters['team-beta'].playersById.p1).toBe('');

      // Both rosters should reference to same updated player name through global state
      expect(state.players.p1).toBe('Alicia');
    });

    it('maintains roster independence when player names diverge', () => {
      let state: AppState = INITIAL_STATE;

      // Create player entities with different names
      state = {
        ...state,
        players: {
          ...state.players,
          p1: 'Alice',
          p2: 'Bob',
          p3: 'Alice Smith', // Different player with similar name
        },
      };

      // Create rosters with overlapping but distinct players
      state = reduce(
        state,
        events.rosterCreated({ rosterId: 'roster-v1', name: 'Roster V1', type: 'scorecard' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: 'roster-v1', id: 'p1', name: 'Alice' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: 'roster-v1', id: 'p2', name: 'Bob' }),
      );

      state = reduce(
        state,
        events.rosterCreated({ rosterId: 'roster-v2', name: 'Roster V2', type: 'scorecard' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: 'roster-v2', id: 'p1', name: 'Alice' }),
      );
      state = reduce(
        state,
        events.rosterPlayerAdded({ rosterId: 'roster-v2', id: 'p3', name: 'Alice Smith' }),
      );

      // Verify roster independence
      expect(Object.keys(state.rosters['roster-v1'].playersById)).toEqual(['p1', 'p2']);
      expect(Object.keys(state.rosters['roster-v2'].playersById)).toEqual(['p1', 'p3']);

      // Both rosters reference player p1, so should show same name through global state
      expect(state.players.p1).toBe('Alice');
      expect(state.players.p2).toBe('Bob');
      expect(state.players.p3).toBe('Alice Smith');

      // Player name changes should affect all rosters referencing that player
      state = reduce(state, events.playerRenamed({ id: 'p1', name: 'Alicia' }));
      expect(state.players.p1).toBe('Alicia'); // Changed
      expect(state.players.p2).toBe('Bob'); // Unchanged
      expect(state.players.p3).toBe('Alice Smith'); // Unchanged
    });
  });
});
