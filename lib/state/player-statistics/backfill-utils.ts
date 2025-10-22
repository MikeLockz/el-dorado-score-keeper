'use client';

import { INITIAL_STATE, reduce, type AppEvent, type AppState } from '../types';

// Import types needed for utility functions
type GameRecord = {
  id: string;
  summary?: {
    metadata?: { version: number };
    players?: { playersById: Record<string, string>; playerTypesById: Record<string, string> };
    scores?: Record<string, unknown>;
    sp?: {
      order?: string[];
      trickCounts?: Record<string, number>;
      roundTallies?: Record<string, Record<string, unknown>>;
    };
    rosterSnapshot?: {
      rosterId?: string | null;
      playersById?: Record<string, string>;
      playerTypesById?: Record<string, 'human' | 'bot'>;
      displayOrder?: Record<string, number>;
    };
    slotMapping?: {
      aliasToId?: Record<string, string>;
    };
  };
  bundle?: { events: AppEvent[] };
};

/**
 * Replays a bundle of events to reconstruct the final game state.
 * This is a pure function that's easily testable.
 */
export function replayBundle(events: ReadonlyArray<AppEvent>): AppState {
  let state = INITIAL_STATE;
  for (const event of events) {
    state = reduce(state, event);
  }
  return state;
}

/**
 * Validates if a score value is finite and can be used in calculations.
 */
export function isValidScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Safely converts a value to a number if possible.
 */
export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Normalizes player aliases by trimming whitespace and converting to lowercase.
 */
export function normalizeAlias(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLocaleLowerCase().replace(/\s+/g, ' ');
}

/**
 * Parses a boolean flag from environment variable or string.
 */
export function parseBooleanFlag(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLocaleLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

/**
 * Determines winner from a scores object.
 */
export function determineWinner(scores: Record<string, number>): { winnerId: string | null; winnerScore: number | null } {
  let winnerId: string | null = null;
  let winnerScore: number | null = null;

  for (const [playerId, score] of Object.entries(scores)) {
    if (winnerScore === null || score > winnerScore) {
      winnerScore = score;
      winnerId = playerId;
    }
  }

  return { winnerId, winnerScore };
}

/**
 * Creates a canonical scores object by resolving player aliases and summing scores.
 */
export function canonicalizeScores(
  originalScores: Record<string, unknown> | undefined,
  aliasResolver: (rawId: string, fallbackName?: string) => string | null,
  playerNamesById: Record<string, string> | undefined
): Record<string, number> {
  const canonicalScores: Record<string, number> = {};

  for (const [rawId, rawScore] of Object.entries(originalScores ?? {})) {
    const canonical = aliasResolver(rawId, playerNamesById?.[rawId]);
    if (!canonical) continue;

    const numeric = toFiniteNumber(rawScore);
    if (numeric === null) continue;

    canonicalScores[canonical] = (canonicalScores[canonical] ?? 0) + numeric;
  }

  return canonicalScores;
}

/**
 * Creates a canonical roster snapshot from game state and existing summary.
 * This is a pure function that handles player canonicalization.
 */
export function deriveCanonicalRosterSnapshot(
  summary: GameRecord['summary'],
  state: AppState,
): {
  rosterId: string | null;
  playersById: Record<string, string>;
  playerTypesById: Record<string, 'human' | 'bot'>;
  displayOrder: Record<string, number>;
} {
  const snapshot = summary.rosterSnapshot;
  if (snapshot && snapshot.playersById && Object.keys(snapshot.playersById).length > 0) {
    return mergeWithExistingSnapshot(snapshot, state);
  }

  return buildSnapshotFromState(state);
}

/**
 * Merges existing snapshot with current state data.
 */
function mergeWithExistingSnapshot(
  snapshot: GameRecord['summary']['rosterSnapshot'],
  state: AppState,
): {
  rosterId: string | null;
  playersById: Record<string, string>;
  playerTypesById: Record<string, 'human' | 'bot'>;
  displayOrder: Record<string, number>;
} {
  const playerTypes: Record<string, 'human' | 'bot'> = {};

  for (const [pid] of Object.entries(snapshot.playersById)) {
    if (!pid) continue;
    const detailType = state.playerDetails?.[pid]?.type;
    const snapshotType = snapshot.playerTypesById?.[pid];

    if (detailType === 'human' || detailType === 'bot') {
      playerTypes[pid] = detailType;
    } else if (snapshotType === 'human' || snapshotType === 'bot') {
      playerTypes[pid] = snapshotType;
    } else {
      playerTypes[pid] = 'human';
    }

    // Use state player name if snapshot doesn't have one
    if (!snapshot.playersById[pid] && state.players?.[pid]) {
      snapshot.playersById[pid] = state.players[pid]!;
    }
  }

  return {
    rosterId: snapshot.rosterId ?? null,
    playersById: { ...snapshot.playersById },
    playerTypesById: playerTypes,
    displayOrder: { ...(snapshot.displayOrder ?? {}) },
  };
}

/**
 * Builds a new snapshot from current game state.
 */
function buildSnapshotFromState(state: AppState): {
  rosterId: string | null;
  playersById: Record<string, string>;
  playerTypesById: Record<string, 'human' | 'bot'>;
  displayOrder: Record<string, number>;
} {
  const playersById: Record<string, string> = {};
  const playerTypesById: Record<string, 'human' | 'bot'> = {};
  const displayOrder: Record<string, number> = {};

  // Process SP order if available
  if (Array.isArray(state.sp?.order)) {
    state.sp.order.forEach((pid, index) => {
      if (typeof pid !== 'string') return;
      const trimmed = pid.trim();
      if (!trimmed || playersById[trimmed]) return;
      playersById[trimmed] = state.players?.[trimmed] ?? trimmed;
      displayOrder[trimmed] = index;
    });
  }

  // Add any remaining players
  for (const [pid, name] of Object.entries(state.players ?? {})) {
    if (!pid || playersById[pid]) continue;
    playersById[pid] = name;
  }

  // Extract player types and names from details
  for (const [pid, details] of Object.entries(state.playerDetails ?? {})) {
    if (!pid) continue;
    if ((details?.type === 'human' || details?.type === 'bot') && !playerTypesById[pid]) {
      playerTypesById[pid] = details.type;
    }
    if (!playersById[pid] && details?.name) {
      playersById[pid] = details.name;
    }
  }

  return {
    rosterId: null,
    playersById,
    playerTypesById,
    displayOrder,
  };
}

/**
 * Creates an alias resolver for matching player IDs and names.
 */
export function createAliasResolver(
  snapshot: ReturnType<typeof deriveCanonicalRosterSnapshot>,
  summary: GameRecord['summary'],
  state: AppState,
): {
  resolve: (rawId: string, fallbackName?: string) => string | null;
} {
  const canonicalSet = new Set(Object.keys(snapshot.playersById));
  const canonicalIds = Object.keys(snapshot.playersById);
  const aliasToId = new Map<string, string>();

  const register = (alias: unknown, canonicalId: string) => {
    if (!alias || typeof alias !== 'string') return;
    const normalized = normalizeAlias(alias);
    if (!normalized || !canonicalSet.has(canonicalId)) return;
    if (!aliasToId.has(normalized)) {
      aliasToId.set(normalized, canonicalId);
    }
  };

  // Register all aliases for canonical players
  for (const canonicalId of canonicalIds) {
    register(canonicalId, canonicalId);
    register(snapshot.playersById[canonicalId], canonicalId);
    register(state.players?.[canonicalId], canonicalId);
    register(state.playerDetails?.[canonicalId]?.name, canonicalId);
  }

  // Register position-based aliases
  registerPositionAliases(snapshot, canonicalSet, register);

  // Register existing slot mapping aliases
  if (summary.slotMapping?.aliasToId) {
    registerSlotMappingAliases(summary.slotMapping.aliasToId, canonicalSet, aliasToId, register);
  }

  const resolve = (rawId: string, fallbackName?: string) => {
    if (!rawId) return null;
    if (canonicalSet.has(rawId)) return rawId;

    const normalizedRaw = normalizeAlias(rawId);
    if (normalizedRaw && aliasToId.has(normalizedRaw)) {
      return aliasToId.get(normalizedRaw)!;
    }

    if (fallbackName) {
      const normalizedHint = normalizeAlias(fallbackName);
      if (normalizedHint && aliasToId.has(normalizedHint)) {
        return aliasToId.get(normalizedHint)!;
      }
    }

    return null;
  };

  return { resolve };
}

/**
 * Registers position-based aliases (player 1, p1, etc.).
 */
function registerPositionAliases(
  snapshot: ReturnType<typeof deriveCanonicalRosterSnapshot>,
  canonicalSet: Set<string>,
  register: (alias: unknown, canonicalId: string) => void
) {
  const displayEntries = Object.entries(snapshot.displayOrder ?? {});

  if (displayEntries.length > 0) {
    for (const [pid, order] of displayEntries) {
      if (!canonicalSet.has(pid)) continue;
      if (typeof order !== 'number' || !Number.isFinite(order)) continue;
      const slot = order + 1;
      register(`player ${slot}`, pid);
      register(`player${slot}`, pid);
      register(`p${slot}`, pid);
    }
  } else {
    const canonicalIds = Object.keys(snapshot.playersById);
    canonicalIds.forEach((pid, index) => {
      const slot = index + 1;
      register(`player ${slot}`, pid);
      register(`player${slot}`, pid);
      register(`p${slot}`, pid);
    });
  }
}

/**
 * Registers aliases from existing slot mapping.
 */
function registerSlotMappingAliases(
  aliasToId: Record<string, string>,
  canonicalSet: Set<string>,
  aliasToIdMap: Map<string, string>,
  register: (alias: unknown, canonicalId: string) => void
) {
  for (const [alias, target] of Object.entries(aliasToId)) {
    if (!target) continue;
    if (canonicalSet.has(target)) {
      register(alias, target);
      continue;
    }
    const normalized = normalizeAlias(target);
    if (normalized && aliasToIdMap.has(normalized)) {
      register(alias, aliasToIdMap.get(normalized)!);
    }
  }
}