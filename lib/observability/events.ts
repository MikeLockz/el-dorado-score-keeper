import { trackBrowserEvent } from '@/lib/observability/browser';
import { uuid } from '@/lib/utils';
import type { SpanAttributesInput } from '@/lib/observability/spans';
import type { KnownAppEvent } from '@/lib/state/types';

type NullableString = string | null | undefined;

const STORAGE_KEY = 'el-dorado:analytics:game-id';

let cachedGameId: string | null | undefined;
const roundStartTimes = new Map<number, number>();

const isBrowser = () => typeof window !== 'undefined';

const readStoredGameId = (): string | null => {
  if (!isBrowser()) return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim().length ? value : null;
  } catch {
    return null;
  }
};

const persistGameId = (id: NullableString) => {
  if (!isBrowser()) return;
  try {
    if (id && id.trim().length) {
      window.localStorage.setItem(STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
};

const coerceMode = (mode?: NullableString): AnalyticsGameMode | undefined => {
  if (!mode) return undefined;
  const normalized = String(mode).toLowerCase();
  if (normalized === 'single-player' || normalized === 'singleplayer' || normalized === 'single') {
    return 'single-player';
  }
  if (normalized === 'scorecard' || normalized === 'multi' || normalized === 'multiplayer') {
    return 'scorecard';
  }
  return undefined;
};

export type AnalyticsGameMode = 'single-player' | 'scorecard';

export type TrackGameStartedPayload = {
  mode: AnalyticsGameMode;
  playerCount: number;
  source?: string;
  hasExistingProgress?: boolean;
};

export type TrackPlayersAddedPayload = {
  addedCount: number;
  totalPlayers: number;
  inputMethod: string;
  source?: string;
  mode?: AnalyticsGameMode;
};

export type TrackRoundFinalizedPayload = {
  roundNumber: number;
  scoringVariant: AnalyticsGameMode;
  playerCount?: number;
  durationMs?: number;
  source?: string;
};

export const getCurrentGameId = (): string | null => {
  if (cachedGameId !== undefined) {
    return cachedGameId ?? null;
  }
  cachedGameId = readStoredGameId();
  return cachedGameId ?? null;
};

export const resetGameSessionId = (seed?: string): string => {
  const candidate = seed && seed.trim().length ? seed.trim() : uuid();
  cachedGameId = candidate;
  persistGameId(candidate);
  return candidate;
};

export const clearGameSessionId = () => {
  cachedGameId = null;
  persistGameId(null);
};

export const markRoundStart = (roundNumber: number, timestamp: number = Date.now()) => {
  if (!isBrowser()) return;
  if (!Number.isFinite(roundNumber) || roundNumber <= 0) return;
  roundStartTimes.set(Math.floor(roundNumber), timestamp);
};

export const trackGameStarted = (payload: TrackGameStartedPayload) => {
  if (!isBrowser()) return;
  const mode = coerceMode(payload.mode) ?? 'scorecard';
  const gameId = resetGameSessionId();
  roundStartTimes.clear();
  markRoundStart(1);

  const attributes: SpanAttributesInput = {
    game_id: gameId,
    mode,
    player_count: Math.max(
      0,
      Math.floor(Number.isFinite(payload.playerCount) ? payload.playerCount : 0),
    ),
    source: payload.source ?? 'unknown',
    has_existing_progress: Boolean(payload.hasExistingProgress),
  };

  trackBrowserEvent('game.started', attributes);
};

export const trackPlayersAdded = (payload: TrackPlayersAddedPayload) => {
  if (!isBrowser()) return;
  const added = Math.max(0, Math.floor(payload.addedCount));
  if (added <= 0) return;
  const gameId = getCurrentGameId();
  if (!gameId) return;
  const totalPlayers = Math.max(0, Math.floor(payload.totalPlayers));
  const inputMethod = payload.inputMethod?.toString().trim();
  if (!inputMethod) return;

  const attributes: SpanAttributesInput = {
    game_id: gameId,
    added_count: added,
    total_players: totalPlayers,
    input_method: inputMethod,
  };
  const mode = coerceMode(payload.mode);
  if (mode) attributes.mode = mode;
  if (payload.source) attributes.source = payload.source;

  trackBrowserEvent('players.added', attributes);
};

export const trackRoundFinalized = (payload: TrackRoundFinalizedPayload) => {
  if (!isBrowser()) return;
  const gameId = getCurrentGameId();
  if (!gameId) return;
  const roundNumber = Math.max(1, Math.floor(payload.roundNumber));
  const mode = coerceMode(payload.scoringVariant) ?? 'scorecard';

  let durationMs: number | undefined = undefined;
  if (typeof payload.durationMs === 'number' && payload.durationMs >= 0) {
    durationMs = payload.durationMs;
  } else {
    const startedAt = roundStartTimes.get(roundNumber);
    if (typeof startedAt === 'number' && startedAt > 0) {
      durationMs = Math.max(0, Date.now() - startedAt);
    }
  }
  roundStartTimes.delete(roundNumber);

  const attributes: SpanAttributesInput = {
    game_id: gameId,
    round_number: roundNumber,
    scoring_variant: mode,
  };

  if (payload.playerCount != null && Number.isFinite(payload.playerCount)) {
    attributes.player_count = Math.max(0, Math.floor(payload.playerCount));
  }
  if (durationMs != null) {
    const seconds = Number((durationMs / 1000).toFixed(2));
    attributes.duration_seconds = seconds;
  }
  if (payload.source) attributes.source = payload.source;

  trackBrowserEvent('round.finalized', attributes);
};

type EventLike = Pick<KnownAppEvent, 'type' | 'payload'> | { type?: string; payload?: unknown };

export type RoundEventAnalyticsContext = {
  mode: AnalyticsGameMode;
  source?: string;
  playerCount?: number;
};

export const applyRoundAnalyticsFromEvents = (
  events: ReadonlyArray<EventLike>,
  context: RoundEventAnalyticsContext,
) => {
  if (!Array.isArray(events) || events.length === 0) return;
  const starts: number[] = [];
  const finals: number[] = [];

  for (const evt of events) {
    if (!evt || typeof evt !== 'object') continue;
    const type = (evt as { type?: string }).type;
    if (type === 'round/state-set') {
      const payload = (evt as { payload?: unknown }).payload as
        | { round?: number; state?: string }
        | undefined;
      const round = payload?.round;
      const state = payload?.state;
      if (state === 'bidding' && Number.isFinite(round)) {
        starts.push(Math.floor(round!));
      }
    } else if (type === 'round/finalize') {
      const payload = (evt as { payload?: unknown }).payload as { round?: number } | undefined;
      const round = payload?.round;
      if (Number.isFinite(round)) {
        finals.push(Math.floor(round!));
      }
    }
  }

  if (starts.length) {
    const seen = new Set<number>();
    for (const round of starts) {
      if (seen.has(round)) continue;
      seen.add(round);
      markRoundStart(round);
    }
  }

  if (finals.length) {
    const seen = new Set<number>();
    for (const round of finals) {
      if (seen.has(round)) continue;
      seen.add(round);
      trackRoundFinalized({
        roundNumber: round,
        scoringVariant: context.mode,
        ...(context.playerCount != null ? { playerCount: context.playerCount } : {}),
        ...(context.source ? { source: context.source } : {}),
      });
    }
  }
};
