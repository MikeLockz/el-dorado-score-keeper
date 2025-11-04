import type { AppState, UUID } from './types';

function normalizeLooseId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function deriveGameIdFromSessionSeed(seed: unknown): string | null {
  // UUID-only: Generate UUIDs from session seed for reproducible game IDs
  // The session seed is used for reproducible deals, game IDs are always UUIDs

  if (typeof seed === 'number' && Number.isFinite(seed) && seed > 0) {
    // Create deterministic UUID from seed for reproducible game IDs
    const normalized = Math.floor(Math.abs(seed));
    if (normalized === 0) return null;

    // Generate a UUID seeded with the sessionSeed for reproducibility
    const hash = (normalized * 2654435761) % 0xffffffff;
    const random = () => {
      const x = Math.sin(hash) * 10000;
      return x - Math.floor(x);
    };

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  if (typeof seed === 'string') {
    const parsed = Number(seed);
    if (Number.isFinite(parsed) && parsed > 0) {
      // Use same deterministic UUID generation for string seeds
      const normalized = Math.floor(Math.abs(parsed));
      const hash = (normalized * 2654435761) % 0xffffffff;
      const random = () => {
        const x = Math.sin(hash) * 10000;
        return x - Math.floor(x);
      };

      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
  }

  return null;
}

export type EntityAvailabilityStatus = 'missing' | 'archived' | 'found';

export type EntityAvailability<T> = Readonly<{
  entity: T | null;
  status: EntityAvailabilityStatus;
  kind: string;
  id: UUID | null;
}>;

export function assertEntityAvailable<T>(
  entity: T | null | undefined,
  kind: string,
  options: {
    id?: string | null | undefined;
    archived?: boolean;
    inferArchived?: (entity: T) => boolean;
  } = {},
): EntityAvailability<T> {
  const id = typeof options.id === 'string' ? options.id.trim() : (options.id ?? null);
  if (entity == null) {
    return { entity: null, status: 'missing', kind, id };
  }
  const archived =
    typeof options.archived === 'boolean'
      ? options.archived
      : typeof options.inferArchived === 'function'
        ? options.inferArchived(entity)
        : false;
  if (archived) {
    return { entity, status: 'archived', kind, id };
  }
  return { entity, status: 'found', kind, id };
}

export function getCurrentSinglePlayerGameId(state: AppState): string | null {
  const sp = state.sp as
    | {
        currentGameId?: unknown;
        gameId?: unknown;
        sessionSeed?: unknown;
      }
    | undefined;
  const direct = normalizeLooseId(sp?.currentGameId);

  // Only support UUID format - reject sp-### format
  if (direct) {
    // Check if it's a UUID format
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(direct)) {
      return direct;
    }
    // Reject sp-### format - this will trigger "game not found" behavior
    return null;
  }

  const legacy = normalizeLooseId(sp?.gameId);
  if (legacy) {
    // Only accept UUID format from legacy field
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(legacy)) {
      return legacy;
    }
    // Reject sp-### format
    return null;
  }

  // Generate new UUID if no game ID exists and we have a session seed (for new games only)
  const sessionSeed = typeof sp?.sessionSeed === 'number' ? sp.sessionSeed : null;
  if (sessionSeed) {
    const derived = deriveGameIdFromSessionSeed(sessionSeed);
    if (derived) return derived;
    return generateUUID();
  }

  return null;
}

export function getActiveScorecardId(state: AppState): string | null {
  const rid = state.activeScorecardRosterId;
  if (typeof rid === 'string') {
    const trimmed = rid.trim();
    if (trimmed && trimmed !== 'scorecard-default') return trimmed;
  }
  return null;
}

export type SinglePlayerRouteView = 'live' | 'scorecard' | 'summary';

export type SinglePlayerRouteOptions = Readonly<{
  view?: SinglePlayerRouteView;
  /**
   * When no active single-player game exists, fall back to either `/single-player` or the
   * new-game flow. Defaults to `new` to encourage starting a session explicitly.
   */
  fallback?: 'entry' | 'new';
}>;

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function singlePlayerPath(
  id: string | null | undefined,
  view: SinglePlayerRouteView = 'live',
): string {
  const normalized = normalizeId(id);
  if (!normalized) return '/single-player';
  if (view === 'scorecard') return `/single-player/${normalized}/scorecard`;
  if (view === 'summary') return `/single-player/${normalized}/summary`;
  return `/single-player/${normalized}`;
}

export function resolveSinglePlayerRoute(
  state: AppState,
  options: SinglePlayerRouteOptions = {},
): string {
  const view = options.view ?? 'live';
  const fallback = options.fallback ?? 'new';
  const id = getCurrentSinglePlayerGameId(state);
  if (id) {
    return singlePlayerPath(id, view);
  }
  if (fallback === 'entry') return '/single-player';
  if (view === 'live') return '/single-player/new';
  return '/single-player';
}

export function ensureSinglePlayerGameIdentifiers(state: AppState): AppState {
  type SinglePlayerStateWithIds = AppState['sp'] & {
    currentGameId?: string | null;
    gameId?: string | null;
  };

  const sp = state.sp as SinglePlayerStateWithIds;
  const existingCurrentId = sp?.currentGameId;
  const existingLegacyId = sp?.gameId;

  // If we already have valid UUIDs in the state, preserve them and ensure consistency
  // This prevents overwriting restored archive UUIDs with new ones
  if (existingCurrentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingCurrentId)) {
    const nextSp: SinglePlayerStateWithIds = { ...sp };
    if (nextSp) {
      nextSp.currentGameId = existingCurrentId;
      nextSp.gameId = existingCurrentId; // Keep both fields in sync
    }
    return { ...state, sp: nextSp };
  }

  if (existingLegacyId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingLegacyId)) {
    const nextSp: SinglePlayerStateWithIds = { ...sp };
    if (nextSp) {
      nextSp.currentGameId = existingLegacyId;
      nextSp.gameId = existingLegacyId; // Keep both fields in sync
    }
    return { ...state, sp: nextSp };
  }

  // Only generate new UUID if we have a sessionSeed AND no existing UUIDs at all
  // This is for genuinely new games, not restored ones
  const sessionSeed = typeof sp?.sessionSeed === 'number' ? sp.sessionSeed : null;
  if (sessionSeed && !existingCurrentId && !existingLegacyId) {
    const newId = deriveGameIdFromSessionSeed(sessionSeed) ?? generateUUID();
    const nextSp: SinglePlayerStateWithIds = { ...sp };
    if (nextSp) {
      nextSp.currentGameId = newId;
      nextSp.gameId = newId;
    }
    return { ...state, sp: nextSp };
  }

  // If no sessionSeed or we have existing IDs, preserve current state
  return state;
}

export type ScorecardRouteView = 'live' | 'summary';

export type ScorecardRouteOptions = Readonly<{
  view?: ScorecardRouteView;
}>;

export const SCORECARD_HUB_PATH = '/games/scorecards';

export function scorecardPath(
  id: string | null | undefined,
  view: ScorecardRouteView = 'live',
): string {
  const normalized = normalizeId(id);
  if (!normalized) return SCORECARD_HUB_PATH;
  if (view === 'summary') return `/scorecard/${normalized}/summary`;
  return `/scorecard/${normalized}`;
}

export function resolveScorecardRoute(
  state: AppState,
  options: ScorecardRouteOptions = {},
): string {
  const view = options.view ?? 'live';
  const id = getActiveScorecardId(state);
  if (id) {
    return scorecardPath(id, view);
  }
  return SCORECARD_HUB_PATH;
}

export type PlayerRouteView = 'detail' | 'statistics';

export type PlayerRouteOptions = Readonly<{
  archived?: boolean;
  fallback?: 'list' | 'archived';
  view?: PlayerRouteView;
}>;

export function resolvePlayerRoute(
  playerId: string | null | undefined,
  options: PlayerRouteOptions = {},
): string {
  const normalized = normalizeId(playerId);
  if (normalized) {
    const view = options.view ?? 'detail';
    if (view === 'statistics') {
      return `/players/${normalized}/statistics`;
    }
    return `/players/${normalized}`;
  }
  const fallback = options.fallback ?? (options.archived ? 'archived' : 'list');
  return fallback === 'archived' ? '/players/archived' : '/players';
}

export type RosterRouteOptions = Readonly<{
  archived?: boolean;
  fallback?: 'list' | 'archived';
}>;

export function resolveRosterRoute(
  rosterId: string | null | undefined,
  options: RosterRouteOptions = {},
): string {
  const normalized = normalizeId(rosterId);
  if (normalized) return `/rosters/${normalized}`;
  const fallback = options.fallback ?? (options.archived ? 'archived' : 'list');
  return fallback === 'archived' ? '/rosters/archived' : '/rosters';
}

export type ArchivedFilterEntity = 'players' | 'rosters';
export type ArchivedFilterView = 'active' | 'archived';

export function resolveArchivedFilterRoute(
  entity: ArchivedFilterEntity,
  view: ArchivedFilterView,
): string {
  switch (entity) {
    case 'players':
      return view === 'archived' ? '/players/archived' : '/players';
    case 'rosters':
      return view === 'archived' ? '/rosters/archived' : '/rosters';
    default:
      return '/';
  }
}

export function resolveArchivedGameRoute(gameId: string | null | undefined): string {
  const normalized = normalizeId(gameId);
  return normalized ? `/games/${normalized}` : '/games';
}

export type GameModalRoute = 'restore' | 'delete';

export function resolveGameModalRoute(
  gameId: string | null | undefined,
  modal: GameModalRoute,
): string {
  const normalized = normalizeId(gameId);
  if (!normalized) return '/games';
  return `/games/${normalized}/${modal}`;
}
