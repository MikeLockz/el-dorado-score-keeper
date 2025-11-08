/**
 * Defensive State Management
 *
 * This module provides systematic validation and repair for app state
 * to prevent "Game unavailable" errors and similar issues across all modes.
 */

import type { AppState, UUID } from './types';
import { generateUUID } from './utils';

export type StateValidationResult = {
  isValid: boolean;
  errors: StateValidationError[];
  repairs: StateRepair[];
};

export type StateValidationError =
  | { type: 'missing_game_id'; mode: 'single' | 'scorecard' }
  | { type: 'game_id_mismatch'; urlId: string; stateId: string | null }
  | { type: 'missing_active_roster'; mode: 'single' | 'scorecard' }
  | { type: 'invalid_roster_reference'; rosterId: string; mode: 'single' | 'scorecard' }
  | { type: 'empty_roster'; rosterId: string }
  | { type: 'missing_players'; rosterId: string }
  | { type: 'corrupted_player_names'; allNamed: string }
  | { type: 'missing_display_order'; rosterId: string };

export type StateRepair =
  | { type: 'create_default_roster'; mode: 'single' | 'scorecard'; rosterId: UUID }
  | { type: 'create_default_player'; playerId: UUID; rosterId: UUID }
  | { type: 'fix_player_names'; playerId: UUID; correctName: string }
  | { type: 'generate_display_order'; rosterId: UUID }
  | { type: 'sync_game_ids'; urlId: string; stateId: string | null };

/**
 * Validates the entire app state for common issues that cause UI failures
 */
export function validateAppState(state: AppState, context: {
  urlGameId?: string | null;
  urlScorecardId?: string | null;
  mode?: 'single' | 'scorecard' | null;
}): StateValidationResult {
  const errors: StateValidationError[] = [];
  const repairs: StateRepair[] = [];

  // Validate single-player mode
  if (!context.mode || context.mode === 'single') {
    validateSinglePlayerState(state, context.urlGameId, errors, repairs);
  }

  // Validate scorecard mode
  if (!context.mode || context.mode === 'scorecard') {
    validateScorecardState(state, context.urlScorecardId, errors, repairs);
  }

  return {
    isValid: errors.length === 0,
    errors,
    repairs,
  };
}

function validateSinglePlayerState(
  state: AppState,
  urlGameId: string | null,
  errors: StateValidationError[],
  repairs: StateRepair[]
) {
  // Check game ID consistency
  const stateGameId = state.sp?.currentGameId ?? state.sp?.gameId ?? null;

  if (urlGameId && stateGameId && urlGameId !== stateGameId) {
    errors.push({
      type: 'game_id_mismatch',
      urlId: urlGameId,
      stateId: stateGameId,
    });
    repairs.push({
      type: 'sync_game_ids',
      urlId: urlGameId,
      stateId: stateGameId,
    });
  }

  // Validate active roster
  const activeRosterId = state.activeSingleRosterId;
  if (!activeRosterId) {
    errors.push({
      type: 'missing_active_roster',
      mode: 'single',
    });
    repairs.push({
      type: 'create_default_roster',
      mode: 'single',
      rosterId: generateUUID(),
    });
  } else if (!state.rosters?.[activeRosterId]) {
    errors.push({
      type: 'invalid_roster_reference',
      rosterId: activeRosterId,
      mode: 'single',
    });
    repairs.push({
      type: 'create_default_roster',
      mode: 'single',
      rosterId: activeRosterId,
    });
  } else {
    const roster = state.rosters[activeRosterId];

    // Check roster has players
    if (!roster.playersById || Object.keys(roster.playersById).length === 0) {
      errors.push({
        type: 'empty_roster',
        rosterId: activeRosterId,
      });
      repairs.push({
        type: 'create_default_roster',
        mode: 'single',
        rosterId: activeRosterId,
      });
    } else {
      // Check for corrupted player names in roster (numeric names, empty names, or all "You")
      const rosterPlayerNames = Object.values(roster.playersById);
      const allPlayersNamedYou = rosterPlayerNames.every(name => name === 'You');
      const hasNumericNames = rosterPlayerNames.some(name => /^\d+$/.test(name));
      const hasEmptyNames = rosterPlayerNames.some(name => !name || name.trim() === '');

      if (allPlayersNamedYou || hasNumericNames || hasEmptyNames) {
        errors.push({
          type: 'corrupted_player_names',
          allNamed: allPlayersNamedYou ? 'You' : hasNumericNames ? 'numeric' : 'empty',
        });

        // Generate repairs for each player in roster
        Object.entries(roster.playersById).forEach(([playerId, currentName], index) => {
          let correctName: string;
          if (index === 0) {
            correctName = 'You'; // Keep first player as "You"
          } else if (roster.playerTypesById?.[playerId] === 'human') {
            correctName = `Player ${index}`;
          } else {
            correctName = `Bot ${index}`;
          }

          repairs.push({
            type: 'fix_player_names',
            playerId,
            correctName,
          });
        });
      }

      // Ensure we have at least 2 players for single-player mode
      if (Object.keys(roster.playersById).length < 2) {
        errors.push({
          type: 'missing_players',
          rosterId: activeRosterId,
        });
        // Create additional bot players if needed
        const currentCount = Object.keys(roster.playersById).length;
        for (let i = currentCount; i < 2; i++) {
          repairs.push({
            type: 'create_default_player',
            playerId: generateUUID(),
            rosterId: activeRosterId,
          });
        }
      }
    }

    // Check display order
    if (!roster.displayOrder || Object.keys(roster.displayOrder).length === 0) {
      errors.push({
        type: 'missing_display_order',
        rosterId: activeRosterId,
      });
      repairs.push({
        type: 'generate_display_order',
        rosterId: activeRosterId,
      });
    }
  }

  // Check for corrupted player names (all players named "You")
  const playerNames = Object.values(state.players ?? {});
  if (playerNames.length > 0 && playerNames.every(name => name === 'You')) {
    errors.push({
      type: 'corrupted_player_names',
      allNamed: 'You',
    });

    // Generate repairs for each player
    Object.keys(state.players ?? {}).forEach((playerId, index) => {
      if (index === 0) {
        repairs.push({
          type: 'fix_player_names',
          playerId,
          correctName: 'You', // Keep first player as "You"
        });
      } else {
        repairs.push({
          type: 'fix_player_names',
          playerId,
          correctName: `Bot ${index}`,
        });
      }
    });
  }
}

function validateScorecardState(
  state: AppState,
  urlScorecardId: string | null,
  errors: StateValidationError[],
  repairs: StateRepair[]
) {
  // Similar validation for scorecard mode
  const activeScorecardId = state.activeScorecardRosterId;
  if (!activeScorecardId) {
    errors.push({
      type: 'missing_active_roster',
      mode: 'scorecard',
    });
    // Note: Scorecards might not need auto-creation like single-player
  }
}

/**
 * Applies repairs to fix state issues
 */
export function applyStateRepairs(state: AppState, repairs: StateRepair[]): AppState {
  let repairedState = { ...state };

  // Group repairs by type for batch processing
  const rosterCreations = repairs.filter(r => r.type === 'create_default_roster');
  const playerCreations = repairs.filter(r => r.type === 'create_default_player');
  const displayOrderGenerations = repairs.filter(r => r.type === 'generate_display_order');
  const playerNameFixes = repairs.filter(r => r.type === 'fix_player_names');

  // Apply roster creation repairs
  rosterCreations.forEach(repair => {
    if (repair.type === 'create_default_roster') {
      repairedState = createDefaultRoster(repairedState, repair.mode, repair.rosterId);
    }
  });

  // Apply player creation repairs
  playerCreations.forEach(repair => {
    if (repair.type === 'create_default_player') {
      repairedState = createDefaultPlayer(repairedState, repair.playerId, repair.rosterId);
    }
  });

  // Apply display order repairs
  displayOrderGenerations.forEach(repair => {
    if (repair.type === 'generate_display_order') {
      repairedState = generateDisplayOrder(repairedState, repair.rosterId);
    }
  });

  // Apply player name fixes
  playerNameFixes.forEach(repair => {
    if (repair.type === 'fix_player_names') {
      repairedState = fixPlayerName(repairedState, repair.playerId, repair.correctName);
    }
  });

  return repairedState;
}

function createDefaultRoster(state: AppState, mode: 'single' | 'scorecard', rosterId: UUID): AppState {
  // Create default players for single-player mode
  const playersById: Record<string, string> = {};
  const playerTypesById: Record<string, 'human' | 'bot'> = {};
  const displayOrder: Record<string, number> = {};

  if (mode === 'single') {
    // Create a human player and 3 bot players for single-player
    const humanId = generateUUID();
    playersById[humanId] = 'You';
    playerTypesById[humanId] = 'human';
    displayOrder[humanId] = 0;

    for (let i = 1; i <= 3; i++) {
      const botId = generateUUID();
      playersById[botId] = `Bot ${i}`;
      playerTypesById[botId] = 'bot';
      displayOrder[botId] = i;
    }
  }

  const roster = {
    name: mode === 'single' ? 'Single Player' : 'Score Card',
    playersById,
    playerTypesById,
    displayOrder,
    type: mode as const,
    createdAt: Date.now(),
    archivedAt: null,
  };

  return {
    ...state,
    players: {
      ...state.players,
      ...playersById,
    },
    playerDetails: {
      ...state.playerDetails,
      ...Object.fromEntries(
        Object.entries(playerTypesById).map(([id, type]) => [
          id,
          { type, archived: false },
        ])
      ),
    },
    humanByMode: {
      ...state.humanByMode,
      single: mode === 'single' ? Object.keys(playerTypesById).find(id => playerTypesById[id] === 'human') : state.humanByMode?.single,
    },
    rosters: {
      ...state.rosters,
      [rosterId]: roster,
    },
    activeSingleRosterId: mode === 'single' ? rosterId : state.activeSingleRosterId,
    activeScorecardRosterId: mode === 'scorecard' ? rosterId : state.activeScorecardRosterId,
  };
}

function createDefaultPlayer(state: AppState, playerId: UUID, rosterId: UUID): AppState {
  const existingPlayerCount = Object.keys(state.rosters?.[rosterId]?.playersById ?? {}).length;
  const playerName = existingPlayerCount === 0 ? 'You' : `Bot ${existingPlayerCount}`;
  const playerType = existingPlayerCount === 0 ? 'human' : 'bot';

  const playersById = { ...state.players, [playerId]: playerName };

  return {
    ...state,
    players: playersById,
    playerDetails: {
      ...state.playerDetails,
      [playerId]: { type: playerType, archived: false },
    },
    humanByMode: {
      ...state.humanByMode,
      single: playerType === 'human' ? playerId : state.humanByMode?.single,
    },
    rosters: state.rosters ? {
      ...state.rosters,
      [rosterId]: {
        ...state.rosters[rosterId],
        playersById: {
          ...state.rosters[rosterId]?.playersById,
          [playerId]: playerName,
        },
        playerTypesById: {
          ...state.rosters[rosterId]?.playerTypesById,
          [playerId]: playerType,
        },
        displayOrder: {
          ...state.rosters[rosterId]?.displayOrder,
          [playerId]: existingPlayerCount,
        },
      },
    } : undefined,
  };
}

function generateDisplayOrder(state: AppState, rosterId: UUID): AppState {
  const roster = state.rosters?.[rosterId];
  if (!roster) return state;

  const playerIds = Object.keys(roster.playersById);
  const displayOrder: Record<string, number> = {};

  playerIds.forEach((playerId, index) => {
    displayOrder[playerId] = index;
  });

  return {
    ...state,
    rosters: {
      ...state.rosters,
      [rosterId]: {
        ...roster,
        displayOrder,
      },
    },
  };
}

function fixPlayerName(state: AppState, playerId: UUID, correctName: string): AppState {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: correctName,
    },
    // Also fix in all rosters that contain this player
    rosters: state.rosters ? Object.fromEntries(
      Object.entries(state.rosters).map(([rosterId, roster]) => {
        if (!roster.playersById[playerId]) {
          return [rosterId, roster]; // Return unchanged if player not in this roster
        }

        return [
          rosterId,
          {
            ...roster,
            playersById: {
              ...roster.playersById,
              [playerId]: correctName,
            },
          },
        ];
      })
    ) : undefined,
  };
}

/**
 * Enhanced selector that includes automatic state repair
 */
export function selectActiveRosterSafe(state: AppState, mode: 'single' | 'scorecard') {
  const validation = validateAppState(state, { mode });

  if (!validation.isValid) {
    console.warn('[state] Issues detected, applying repairs:', validation.errors);
    state = applyStateRepairs(state, validation.repairs);
  }

  // Now use the original selector
  const rosterId = mode === 'single' ? state.activeSingleRosterId : state.activeScorecardRosterId;
  if (rosterId && state.rosters?.[rosterId]) {
    return {
      rosterId,
      name: state.rosters[rosterId].name,
      playersById: state.rosters[rosterId].playersById,
      playerTypesById: state.rosters[rosterId].playerTypesById ?? {},
      displayOrder: state.rosters[rosterId].displayOrder,
    };
  }

  return null;
}