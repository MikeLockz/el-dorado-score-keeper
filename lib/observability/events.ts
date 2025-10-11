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

type ArchivedGameEventPayload = Readonly<{
  gameId: string;
  mode?: NullableString;
  source?: string;
}>;

export type ScorecardSummaryExportPayload = Readonly<{
  scorecardId: string;
  format: string;
  source?: string;
}>;

export type SinglePlayerAnalyticsView = 'live' | 'scorecard' | 'summary';

export type TrackSinglePlayerViewPayload = Readonly<{
  gameId: string | null | undefined;
  view: SinglePlayerAnalyticsView;
  source?: string;
}>;

export type ScorecardAnalyticsView = 'live' | 'summary';

export type TrackScorecardViewPayload = Readonly<{
  scorecardId: string | null | undefined;
  view: ScorecardAnalyticsView;
  source?: string;
}>;

export type TrackPlayersViewPayload = Readonly<{
  filter: 'active' | 'archived';
  source?: string;
}>;

export type TrackPlayerDetailViewPayload = Readonly<{
  playerId: string | null | undefined;
  archived?: boolean;
  source?: string;
}>;

export type TrackRostersViewPayload = Readonly<{
  filter: 'active' | 'archived';
  source?: string;
}>;

export type TrackRosterDetailViewPayload = Readonly<{
  rosterId: string | null | undefined;
  archived?: boolean;
  source?: string;
}>;

export type TrackGamesListViewPayload = Readonly<{
  source?: string;
}>;

export type TrackGameDetailViewPayload = Readonly<{
  gameId: string | null | undefined;
  source?: string;
}>;

export type TrackSinglePlayerNewViewPayload = Readonly<{
  hasProgress: boolean;
  source?: string;
}>;

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

export const trackArchivedGameRestored = (payload: ArchivedGameEventPayload) => {
  if (!isBrowser()) return;
  const trimmedId = payload.gameId?.trim();
  if (!trimmedId) return;
  trackBrowserEvent('archive.game.restored', {
    game_id: trimmedId,
    mode: coerceMode(payload.mode) ?? 'scorecard',
    source: payload.source ?? 'unknown',
  });
};

export const trackArchivedGameDeleted = (payload: ArchivedGameEventPayload) => {
  if (!isBrowser()) return;
  const trimmedId = payload.gameId?.trim();
  if (!trimmedId) return;
  trackBrowserEvent('archive.game.deleted', {
    game_id: trimmedId,
    mode: coerceMode(payload.mode) ?? 'scorecard',
    source: payload.source ?? 'unknown',
  });
};

export const trackScorecardSummaryExport = (payload: ScorecardSummaryExportPayload) => {
  if (!isBrowser()) return;
  const id = payload.scorecardId?.trim();
  if (!id) return;
  const format = payload.format?.toString().trim();
  if (!format) return;
  trackBrowserEvent('scorecard.summary.export', {
    scorecard_id: id,
    format,
    source: payload.source ?? 'scorecard.summary',
  });
};

export const trackSinglePlayerView = (payload: TrackSinglePlayerViewPayload) => {
  if (!isBrowser()) return;
  const id =
    typeof payload.gameId === 'string' ? payload.gameId.trim() : String(payload.gameId).trim();
  if (!id) return;
  const view = payload.view ?? 'live';
  trackBrowserEvent('single-player.viewed', {
    game_id: id,
    view,
    source: payload.source ?? 'route',
  });
};

export const trackScorecardView = (payload: TrackScorecardViewPayload) => {
  if (!isBrowser()) return;
  const id = payload.scorecardId?.toString().trim();
  if (!id) return;
  const view = payload.view ?? 'live';
  trackBrowserEvent('scorecard.viewed', {
    scorecard_id: id,
    view,
    source: payload.source ?? 'route',
  });
};

export const trackPlayersView = (payload: TrackPlayersViewPayload) => {
  if (!isBrowser()) return;
  const filter = payload.filter ?? 'active';
  trackBrowserEvent('players.viewed', {
    filter,
    source: payload.source ?? 'route',
  });
};

export const trackPlayerDetailView = (payload: TrackPlayerDetailViewPayload) => {
  if (!isBrowser()) return;
  const id = payload.playerId?.toString().trim();
  if (!id) return;
  trackBrowserEvent('player.detail.viewed', {
    player_id: id,
    archived: Boolean(payload.archived),
    source: payload.source ?? 'route',
  });
};

export const trackRostersView = (payload: TrackRostersViewPayload) => {
  if (!isBrowser()) return;
  const filter = payload.filter ?? 'active';
  trackBrowserEvent('rosters.viewed', {
    filter,
    source: payload.source ?? 'route',
  });
};

export const trackRosterDetailView = (payload: TrackRosterDetailViewPayload) => {
  if (!isBrowser()) return;
  const id = payload.rosterId?.toString().trim();
  if (!id) return;
  trackBrowserEvent('roster.detail.viewed', {
    roster_id: id,
    archived: Boolean(payload.archived),
    source: payload.source ?? 'route',
  });
};

export const trackGamesListView = (payload: TrackGamesListViewPayload = {}) => {
  if (!isBrowser()) return;
  trackBrowserEvent('games.list.viewed', {
    source: payload.source ?? 'route',
  });
};

export const trackGameDetailView = (payload: TrackGameDetailViewPayload) => {
  if (!isBrowser()) return;
  const id = payload.gameId?.toString().trim();
  if (!id) return;
  trackBrowserEvent('game.detail.viewed', {
    game_id: id,
    source: payload.source ?? 'route',
  });
};

export const trackSinglePlayerNewView = (payload: TrackSinglePlayerNewViewPayload) => {
  if (!isBrowser()) return;
  trackBrowserEvent('single-player.new.viewed', {
    has_progress: Boolean(payload.hasProgress),
    source: payload.source ?? 'route',
  });
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
