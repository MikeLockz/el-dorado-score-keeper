import { SUMMARY_METADATA_VERSION, listGames, type GameRecord } from './io';
import * as statsCache from './player-statistics/cache';
import type { NormalizedHistoricalGame } from './player-statistics/cache';
import {
  deriveHistoricalSecondaryMetrics,
  resetHistoricalSecondaryMetricsCache,
} from './player-statistics/secondary';
import { selectIsGameComplete } from './selectors';
import type { AppState } from './types';

export type PlayerStatsLoadState = Readonly<{
  isLoadingLive: boolean;
  isLoadingHistorical: boolean;
  loadError: string | null;
}>;

export type PrimaryMetrics = Readonly<{
  totalGamesPlayed: number;
  totalGamesWon: number;
  winRatePercent: number;
}>;

export type SecondaryMetrics = Readonly<{
  averageScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  averageBidAccuracy: number | null;
  medianPlacement: number | null;
}>;

export type RoundMetric = Readonly<{
  roundNo: number;
  bidCount: number;
  bids: number[];
  highestBid: number | null;
  lowestBid: number | null;
  accuracyPercent: number | null;
  accuracyMatches: number;
  accuracyTotal: number;
}>;

export type HandInsight = Readonly<{
  handsPlayed: number;
  suitCounts: Readonly<Record<'clubs' | 'diamonds' | 'hearts' | 'spades', number>>;
  topSuit: 'clubs' | 'diamonds' | 'hearts' | 'spades' | null;
}>;

type ScoreAccumulator = Readonly<{
  sum: number;
  count: number;
  highest: number | null;
  lowest: number | null;
}>;

const emptyScoreAccumulator: ScoreAccumulator = Object.freeze({
  sum: 0,
  count: 0,
  highest: null,
  lowest: null,
});

type BidAccuracyAggregate = Readonly<{
  matches: number;
  total: number;
}>;

const emptyBidAccuracyAggregate: BidAccuracyAggregate = Object.freeze({
  matches: 0,
  total: 0,
});

export type AdvancedMetrics = Readonly<{
  trickEfficiency: Readonly<{
    averageDelta: number | null;
    perfectBidStreak: number;
  }>;
  suitMastery: Readonly<{
    trumpWinRateBySuit: Readonly<Record<'clubs' | 'diamonds' | 'hearts' | 'spades', number>>;
    trickSuccessBySuit: Readonly<Record<'clubs' | 'diamonds' | 'hearts' | 'spades', number>>;
  }>;
  scoreVolatility: Readonly<{
    standardDeviation: number | null;
    largestComeback: number | null;
    largestLeadBlown: number | null;
  }>;
  momentum: Readonly<{
    rollingAverageScores: ReadonlyArray<{
      gameId: string;
      score: number;
      average: number;
    }>;
    currentWinStreak: number;
    longestWinStreak: number;
  }>;
}>;

export type PlayerStatisticsSummary = PlayerStatsLoadState &
  Readonly<{
    playerId: string;
    primary: PrimaryMetrics | null;
    secondary: SecondaryMetrics | null;
    rounds: ReadonlyArray<RoundMetric>;
    handInsights: HandInsight | null;
    advanced: AdvancedMetrics | null;
  }>;

export type PlayerStatisticsLoadInput = Readonly<{
  playerId: string;
  stateSnapshot: AppState;
  cacheKey?: string | null | undefined;
}>;

const suitNames: Array<'clubs' | 'diamonds' | 'hearts' | 'spades'> = [
  'clubs',
  'diamonds',
  'hearts',
  'spades',
];

export const createPendingPlayerStatisticsSummary = (
  playerId: string,
): PlayerStatisticsSummary => ({
  playerId,
  isLoadingLive: true,
  isLoadingHistorical: true,
  loadError: null,
  primary: null,
  secondary: null,
  rounds: [],
  handInsights: null,
  advanced: null,
});

export const createEmptyPlayerStatisticsSummary = (
  playerId: string,
): PlayerStatisticsSummary => ({
  playerId,
  isLoadingLive: false,
  isLoadingHistorical: false,
  loadError: null,
  primary: null,
  secondary: null,
  rounds: [],
  handInsights: null,
  advanced: null,
});

export const createErroredPlayerStatisticsSummary = (
  playerId: string,
  errorMessage: string,
): PlayerStatisticsSummary => ({
  playerId,
  isLoadingLive: false,
  isLoadingHistorical: false,
  loadError: errorMessage,
  primary: null,
  secondary: null,
  rounds: [],
  handInsights: null,
  advanced: null,
});

export async function loadPlayerStatisticsSummary({
  playerId: rawPlayerId,
  stateSnapshot,
}: PlayerStatisticsLoadInput): Promise<PlayerStatisticsSummary> {
  const playerId = typeof rawPlayerId === 'string' ? rawPlayerId.trim() : '';
  if (!playerId) {
    throw new Error('Player ID is required to load statistics');
  }
  if (!stateSnapshot || typeof stateSnapshot !== 'object') {
    throw new Error('State snapshot is required to load statistics');
  }
  const base = createEmptyPlayerStatisticsSummary(playerId);
  const playerLabel = extractPlayerLabel(stateSnapshot, playerId);
  const liveMetrics = deriveLiveMetrics(stateSnapshot, playerId);
  debugLog('state snapshot players', {
    playerId,
    directPlayers: Object.keys(stateSnapshot.players ?? {}),
    spOrder: stateSnapshot.sp?.order ?? [],
    spTrickCounts: Object.keys(stateSnapshot.sp?.trickCounts ?? {}),
  });
  const {
    totals: historicalTotals,
    scores: historicalScores,
    bidAccuracy: historicalBidAccuracy,
    placements: historicalPlacements,
    error: historicalError,
  } = await computeHistoricalAggregates(playerId, playerLabel);

  debugLog('combined totals', {
    playerId,
    liveMetrics,
    historicalTotals,
    winRatePercent:
      historicalTotals.gamesPlayed + liveMetrics.gamesPlayed === 0
        ? 0
        : Math.round(
            ((historicalTotals.gamesWon + liveMetrics.gamesWon) /
              (historicalTotals.gamesPlayed + liveMetrics.gamesPlayed)) *
              1000,
          ) / 10,
    loadError: historicalError,
  });

  const totalGamesPlayed = historicalTotals.gamesPlayed + liveMetrics.gamesPlayed;
  const totalGamesWon = historicalTotals.gamesWon + liveMetrics.gamesWon;
  const winRatePercent =
    totalGamesPlayed === 0
      ? 0
      : Math.round((totalGamesWon / totalGamesPlayed) * 1000) / 10;

  const totalScoreSum =
    historicalScores.sum + (liveMetrics.score != null ? liveMetrics.score : 0);
  const totalScoreCount =
    historicalScores.count + (liveMetrics.score != null ? 1 : 0);

  const totalBidAccuracyMatches =
    historicalBidAccuracy.matches + liveMetrics.bidAccuracy.matches;
  const totalBidAccuracyRounds = historicalBidAccuracy.total + liveMetrics.bidAccuracy.total;
  const averageBidAccuracy =
    totalBidAccuracyRounds === 0
      ? null
      : Math.round((totalBidAccuracyMatches / totalBidAccuracyRounds) * 1000) / 10;

  const placementSamples: number[] = historicalPlacements.length
    ? [...historicalPlacements]
    : [];
  if (liveMetrics.placement !== null) {
    placementSamples.push(liveMetrics.placement);
  }
  const medianPlacement = calculateMedianPlacement(placementSamples);

  let highestScore = historicalScores.highest;
  if (liveMetrics.score != null) {
    highestScore =
      highestScore == null ? liveMetrics.score : Math.max(highestScore, liveMetrics.score);
  }
  let lowestScore = historicalScores.lowest;
  if (liveMetrics.score != null) {
    lowestScore =
      lowestScore == null ? liveMetrics.score : Math.min(lowestScore, liveMetrics.score);
  }

  const averageScore =
    totalScoreCount === 0 ? null : Math.round((totalScoreSum / totalScoreCount) * 10) / 10;
  const secondary: SecondaryMetrics | null =
    totalScoreCount === 0
      ? null
      : {
          averageScore,
          highestScore,
          lowestScore,
          averageBidAccuracy,
          medianPlacement,
        };

  const primary: PrimaryMetrics = {
    totalGamesPlayed,
    totalGamesWon,
    winRatePercent,
  };

  return {
    ...base,
    loadError: historicalError,
    primary,
    secondary,
  };
}

export function clonePlayerStatisticsSummary(
  summary: PlayerStatisticsSummary,
  overrides: Partial<PlayerStatisticsSummary> = {},
): PlayerStatisticsSummary {
  return {
    ...summary,
    ...overrides,
    handInsights:
      overrides.handInsights ??
      (summary.handInsights
        ? {
            handsPlayed: summary.handInsights.handsPlayed,
            suitCounts: { ...summary.handInsights.suitCounts },
            topSuit: summary.handInsights.topSuit,
          }
        : null),
    primary: overrides.primary ?? summary.primary,
    secondary: overrides.secondary ?? summary.secondary,
    rounds: overrides.rounds ?? summary.rounds,
    advanced: overrides.advanced ?? summary.advanced,
  };
}

export const PLAYER_STATISTICS_SUITS = Object.freeze([...suitNames]);

export type { NormalizedHistoricalGame } from './player-statistics/cache';
export { getCachedHistoricalGame, setCachedHistoricalGame } from './player-statistics/cache';
export function resetPlayerStatisticsCache(): void {
  statsCache.resetPlayerStatisticsCache();
  resetHistoricalSecondaryMetricsCache();
}

type HistoricalPrimaryTotals = Readonly<{
  gamesPlayed: number;
  gamesWon: number;
}>;

const emptyHistoricalTotals: HistoricalPrimaryTotals = Object.freeze({
  gamesPlayed: 0,
  gamesWon: 0,
});

const enableDebugLogs =
  typeof process !== 'undefined' ? process.env?.NODE_ENV !== 'production' : true;

function debugLog(message: string, payload?: unknown) {
  if (!enableDebugLogs) return;
  try {
    console.debug(`[player-stats] ${message}`, payload ?? '');
  } catch {}
}

type LiveMetrics = Readonly<{
  gamesPlayed: number;
  gamesWon: number;
  score: number | null;
  finishedAt: number | null;
  bidAccuracy: BidAccuracyAggregate;
  placement: number | null;
}>;

const emptyLiveMetrics: LiveMetrics = Object.freeze({
  gamesPlayed: 0,
  gamesWon: 0,
  score: null,
  finishedAt: null,
  bidAccuracy: emptyBidAccuracyAggregate,
  placement: null,
});

function extractPlayerLabel(state: AppState, playerId: string): string | null {
  if (!state || typeof state !== 'object') return null;
  const directLabel = state.players?.[playerId];
  if (typeof directLabel === 'string') {
    const trimmed = directLabel.trim();
    if (trimmed) return trimmed;
  }
  const detailName = state.playerDetails?.[playerId]?.name;
  if (typeof detailName === 'string') {
    const trimmed = detailName.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function deriveLiveMetrics(state: AppState, playerId: string): LiveMetrics {
  if (!state || typeof state !== 'object') return emptyLiveMetrics;
  const normalizedId = playerId;
  const players = state.players ?? {};
  const spOrder = state.sp?.order ?? [];
  const spTrickCounts = state.sp?.trickCounts ?? {};
  const playerPresent =
    (!!normalizedId && normalizedId in players) ||
    (Array.isArray(spOrder) && spOrder.some((pid) => pid === normalizedId)) ||
    Object.prototype.hasOwnProperty.call(spTrickCounts, normalizedId);

  if (!normalizedId || !playerPresent) {
    return emptyLiveMetrics;
  }

  const phase = state.sp?.phase;
  const summaryEnteredAt = state.sp?.summaryEnteredAt;
  const liveGameComplete =
    phase === 'summary' ||
    phase === 'game-summary' ||
    phase === 'done' ||
    (typeof summaryEnteredAt === 'number' && Number.isFinite(summaryEnteredAt)) ||
    selectIsGameComplete(state);

  if (!liveGameComplete) {
    return emptyLiveMetrics;
  }

  const scores = state.scores ?? {};
  const rawScore = scores[playerId];
  const playerScore =
    typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : Number(rawScore);

  let gamesWon = 0;
  if (Number.isFinite(playerScore)) {
    let topScore: number | null = null;
    for (const value of Object.values(scores)) {
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric)) continue;
      if (topScore === null || numeric > topScore) {
        topScore = numeric;
      }
    }
    if (topScore !== null && playerScore === topScore) {
      // Count ties as wins until explicit tie-break rules are defined (see PLAYER_STATISTICS.md §8).
      gamesWon = 1;
    }
  }

  const bidAccuracy = deriveLiveBidAccuracy(state, playerId);
  const placement = calculatePlacementFromScores(scores, playerId);

  return {
    gamesPlayed: 1,
    gamesWon,
    score: Number.isFinite(playerScore) ? (playerScore as number) : null,
    finishedAt:
      typeof summaryEnteredAt === 'number' && Number.isFinite(summaryEnteredAt)
        ? (summaryEnteredAt as number)
        : Date.now(),
    bidAccuracy,
    placement,
  };
}

function deriveLiveBidAccuracy(state: AppState, playerId: string): BidAccuracyAggregate {
  const roundTallies = state.sp?.roundTallies ?? {};
  const roundsState = state.rounds ?? {};
  let matches = 0;
  let total = 0;

  if (!roundTallies || typeof roundTallies !== 'object') {
    return emptyBidAccuracyAggregate;
  }

  for (const [roundKey, tallies] of Object.entries(roundTallies as Record<string, unknown>)) {
    if (!tallies || typeof tallies !== 'object') continue;
    const roundNo = Number(roundKey);
    if (!Number.isFinite(roundNo)) continue;
    const actual = toFiniteNumber((tallies as Record<string, unknown>)[playerId]);
    if (actual == null) continue;
    const roundState =
      (roundsState as unknown as Record<string, AppState['rounds'][number]>)[String(roundNo)];
    const bids = roundState?.bids ?? {};
    const bid = toFiniteNumber((bids as Record<string, unknown>)[playerId]);
    if (bid == null) continue;
    total += 1;
    if (bid === actual) {
      matches += 1;
    }
  }

  return total === 0
    ? emptyBidAccuracyAggregate
    : (Object.freeze({ matches, total }) as BidAccuracyAggregate);
}

function calculatePlacementFromScores(
  scores: Readonly<Record<string, unknown>>,
  playerId: string,
): number | null {
  if (!scores || typeof scores !== 'object') return null;
  const entries: Array<[string, number]> = [];

  for (const [pid, rawScore] of Object.entries(scores)) {
    const normalizedId = typeof pid === 'string' ? pid.trim() : '';
    if (!normalizedId) continue;
    const numericScore = toFiniteNumber(rawScore);
    if (numericScore == null) continue;
    entries.push([normalizedId, numericScore]);
  }

  if (entries.length === 0) return null;

  const playerEntry = entries.find(([pid]) => pid === playerId);
  if (!playerEntry) return null;
  const playerScore = playerEntry[1];

  const uniqueScores = Array.from(new Set(entries.map(([, value]) => value))).sort(
    (a, b) => b - a,
  );
  const index = uniqueScores.findIndex((value) => value === playerScore);
  return index === -1 ? null : index + 1;
}

function calculateMedianPlacement(placements: ReadonlyArray<number>): number | null {
  if (!Array.isArray(placements) || placements.length === 0) return null;
  const valid = placements.filter((value) => Number.isFinite(value)).map((value) => Math.trunc(value));
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const midIndex = Math.floor((sorted.length - 1) / 2);
  return sorted[midIndex] ?? null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function resolveHistoricalPlayerId(
  game: NormalizedHistoricalGame,
  playerId: string,
  playerLabel: string | null,
): string | null {
  if (game.playerIds.has(playerId)) {
    return playerId;
  }
  const aliasMap = game.slotMapping?.aliasToId ?? {};
  const searchValues: Array<string> = [];
  if (playerId) searchValues.push(playerId);
  if (playerLabel) searchValues.push(playerLabel);
  for (const candidate of searchValues) {
    const normalizedAlias = normalizeAliasCandidate(candidate);
    if (!normalizedAlias) continue;
    const mapped = aliasMap[normalizedAlias];
    if (typeof mapped === 'string' && mapped && game.playerIds.has(mapped)) {
      return mapped;
    }
  }
  if (playerLabel) {
    const normalizedLabel = playerLabel.trim().toLocaleLowerCase();
    if (normalizedLabel) {
      for (const [id, name] of Object.entries(game.namesById)) {
        if (
          typeof name === 'string' &&
          name.trim().toLocaleLowerCase() === normalizedLabel &&
          game.playerIds.has(id)
        ) {
          return id;
        }
      }
    }
  }
  return null;
}

function normalizeAliasCandidate(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLocaleLowerCase().replace(/\s+/g, ' ');
}

function normalizeHistoricalGame(record: GameRecord): NormalizedHistoricalGame {
  const summary = record.summary ?? { playersById: {}, scores: {} };
  const metadataVersion = Number(summary.metadata?.version ?? 0);
  const rosterSnapshot = summary.rosterSnapshot ?? null;
  const slotMapping = summary.slotMapping ?? null;
  const namesById: Record<string, string> = {};

  const registerPlayer = (id: unknown, name?: unknown) => {
    if (typeof id !== 'string') return;
    const trimmedId = id.trim();
    if (!trimmedId) return;
    if (Object.prototype.hasOwnProperty.call(namesById, trimmedId)) return;
    const fromRoster = rosterSnapshot?.playersById?.[trimmedId];
    const fromSummary = summary.playersById?.[trimmedId];
    const labelCandidate =
      typeof name === 'string' && name.trim()
        ? name.trim()
        : typeof fromRoster === 'string' && fromRoster.trim()
          ? fromRoster.trim()
          : typeof fromSummary === 'string' && fromSummary.trim()
            ? fromSummary.trim()
            : trimmedId;
    namesById[trimmedId] = labelCandidate;
  };

  const registerId = (value: unknown) => registerPlayer(value);

  for (const [pid, name] of Object.entries(rosterSnapshot?.playersById ?? {})) {
    registerPlayer(pid, name);
  }
  for (const [pid, name] of Object.entries(summary.playersById ?? {})) {
    registerPlayer(pid, name);
  }

  const spSummary = summary.sp ?? null;
  if (spSummary) {
    if (Array.isArray(spSummary.order)) {
      for (const pid of spSummary.order) {
        registerPlayer(pid, summary.playersById?.[String(pid)]);
      }
    }
    registerId(spSummary.dealerId);
    registerId(spSummary.leaderId);
    for (const pid of Object.keys(spSummary.trickCounts ?? {})) registerId(pid);
  }

  const scores: Record<string, number> = {};
  for (const [pidRaw, scoreRaw] of Object.entries(summary.scores ?? {})) {
    if (typeof pidRaw !== 'string') continue;
    const pid = pidRaw.trim();
    if (!pid) continue;
    const numericScore = typeof scoreRaw === 'number' ? scoreRaw : Number(scoreRaw);
    if (!Number.isFinite(numericScore)) continue;
    scores[pid] = numericScore;
    registerId(pid);
  }

  const playerIds = new Set<string>(Object.keys(namesById));
  const declaredWinnerId =
    typeof summary.winnerId === 'string' && summary.winnerId.trim()
      ? summary.winnerId.trim()
      : '';
  if (declaredWinnerId) {
    registerId(declaredWinnerId);
    playerIds.add(declaredWinnerId);
  }

  const winnerIds = (() => {
    const winners = new Set<string>();
    if (declaredWinnerId) {
      winners.add(declaredWinnerId);
      return winners;
    }
    let topScore: number | null = null;
    for (const [pid, score] of Object.entries(scores)) {
      const value = typeof score === 'number' ? score : Number(score);
      if (!Number.isFinite(value)) continue;
      if (topScore === null || value > topScore) {
        topScore = value;
        winners.clear();
        winners.add(pid);
      } else if (value === topScore) {
        winners.add(pid);
      }
    }
    return winners;
  })();

  const finishedAt = Number.isFinite(record.finishedAt) ? Number(record.finishedAt) : Date.now();
  return {
    id: record.id,
    finishedAt,
    metadataVersion,
    playerIds,
    scores,
    winnerIds,
    namesById,
    rosterSnapshot,
    slotMapping,
  };
}

function getOrNormalizeGame(record: GameRecord): NormalizedHistoricalGame {
  return (
    statsCache.getCachedHistoricalGame(record.id) ??
    statsCache.setCachedHistoricalGame(record.id, normalizeHistoricalGame(record))
  );
}

async function computeHistoricalAggregates(
  playerId: string,
  playerLabel: string | null,
): Promise<{
  totals: HistoricalPrimaryTotals;
  scores: ScoreAccumulator;
  bidAccuracy: BidAccuracyAggregate;
  placements: ReadonlyArray<number>;
  error: string | null;
}> {
  try {
    const games = await listGames();
    if (!Array.isArray(games) || games.length === 0) {
      debugLog('historical lookup returned no games', { playerId });
      return {
        totals: emptyHistoricalTotals,
        scores: emptyScoreAccumulator,
        bidAccuracy: emptyBidAccuracyAggregate,
        placements: Object.freeze([]),
        error: null,
      };
    }
    debugLog('historical lookup count', { playerId, count: games.length });
    let gamesPlayed = 0;
    let gamesWon = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    let highestScore: number | null = null;
    let lowestScore: number | null = null;
    let legacySkipped = 0;
    let bidAccuracyMatches = 0;
    let bidAccuracyTotal = 0;
    const placements: number[] = [];
    for (const record of games) {
      if (!record || typeof record !== 'object') continue;
      const normalized = getOrNormalizeGame(record);
      if (normalized.metadataVersion < SUMMARY_METADATA_VERSION) {
        legacySkipped += 1;
        debugLog('historical skipping legacy summary', {
          playerId,
          gameId: record.id,
          metadataVersion: normalized.metadataVersion,
        });
        continue;
      }
      const canonicalId = resolveHistoricalPlayerId(normalized, playerId, playerLabel);
      if (!canonicalId) {
        debugLog('historical skipping unmatched game', {
          playerId,
          playerLabel,
          gameId: record.id,
          playerIds: Array.from(normalized.playerIds),
          aliases: normalized.slotMapping?.aliasToId ?? null,
        });
        continue;
      }
      gamesPlayed += 1;
      const scoreForPlayer = normalized.scores[canonicalId];
      if (scoreForPlayer != null) {
        scoreSum += scoreForPlayer;
        scoreCount += 1;
        highestScore = highestScore == null ? scoreForPlayer : Math.max(highestScore, scoreForPlayer);
        lowestScore = lowestScore == null ? scoreForPlayer : Math.min(lowestScore, scoreForPlayer);
      } else {
        debugLog('historical game missing score for player', {
          playerId,
          gameId: record.id,
          winnerIds: Array.from(normalized.winnerIds),
          availableScores: normalized.scores,
        });
      }
      if (normalized.winnerIds.has(canonicalId)) {
        gamesWon += 1;
        debugLog('historical counted win', { playerId, canonicalId, gameId: record.id });
      } else {
        debugLog('historical counted loss', { playerId, canonicalId, gameId: record.id });
      }
      const derivedSecondary = deriveHistoricalSecondaryMetrics(record, normalized);
      const accuracy = derivedSecondary.bidAccuracyByPlayer[canonicalId];
      if (accuracy) {
        bidAccuracyMatches += accuracy.matches;
        bidAccuracyTotal += accuracy.total;
      }
      const placement = calculatePlacementFromScores(normalized.scores, canonicalId);
      if (placement !== null) {
        placements.push(placement);
      }
    }
    debugLog('historical players scanned', {
      playerId,
      scoreCount,
      highestScore,
      lowestScore,
      legacySkipped,
      bidAccuracyMatches,
      bidAccuracyTotal,
      placements: placements.length,
    });
    return {
      totals: Object.freeze({ gamesPlayed, gamesWon }),
      scores: Object.freeze({
        sum: scoreSum,
        count: scoreCount,
        highest: highestScore,
        lowest: lowestScore,
      }),
      bidAccuracy: Object.freeze({
        matches: bidAccuracyMatches,
        total: bidAccuracyTotal,
      }),
      placements: Object.freeze([...placements]),
      error:
        legacySkipped > 0
          ? 'Some archived games are still migrating; statistics may be incomplete.'
          : null,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unable to load historical statistics.';
    debugLog('historical aggregation failure', { playerId, error: message });
    return {
      totals: emptyHistoricalTotals,
      scores: emptyScoreAccumulator,
      bidAccuracy: emptyBidAccuracyAggregate,
      placements: Object.freeze([]),
      error: message,
    };
  }
}
