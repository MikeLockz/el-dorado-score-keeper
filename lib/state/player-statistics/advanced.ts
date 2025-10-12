import type { GameRecord } from '../io';
import type { NormalizedHistoricalGame } from './cache';

export type SuitKey = 'clubs' | 'diamonds' | 'hearts' | 'spades';

type RoundSnapshot = Readonly<{ bid: number | null; actual: number | null }>;
export type RoundSnapshotMap = Readonly<Record<number, RoundSnapshot>>;

export type AdvancedRoundResult = Readonly<{
  round: number;
  bid: number | null;
  actual: number | null;
}>;

export type AdvancedGameSample = Readonly<{
  gameId: string;
  finishedAt: number;
  score: number | null;
  won: boolean;
  trumpSuit: SuitKey | null;
  tricksWonBySuit: Readonly<Record<SuitKey, number>>;
  tricksPlayedBySuit: Readonly<Record<SuitKey, number>>;
  minScoreDiff: number | null;
  maxScoreDiff: number | null;
  roundResults: ReadonlyArray<AdvancedRoundResult>;
}>;

export type AdvancedMetricsInput = Readonly<{
  historicalGames: ReadonlyArray<AdvancedGameSample>;
  liveGame: AdvancedGameSample | null;
  windowSize?: number;
}>;

export type AdvancedMetricsResult = Readonly<{
  trickEfficiency: Readonly<{
    averageDelta: number | null;
    perfectBidStreak: number;
  }>;
  suitMastery: Readonly<{
    trumpWinRateBySuit: Readonly<Record<SuitKey, number | null>>;
    trickSuccessBySuit: Readonly<Record<SuitKey, number | null>>;
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

type AdvancedSampleCacheKey = string;

type InternalGameAnalysis = Readonly<{
  trumpSuit: SuitKey | null;
  tricksWonBySuit: Record<SuitKey, number>;
  tricksPlayedBySuit: Record<SuitKey, number>;
  minScoreDiff: number | null;
  maxScoreDiff: number | null;
}>;

const suitKeys: ReadonlyArray<SuitKey> = Object.freeze(['clubs', 'diamonds', 'hearts', 'spades']);

const gameAnalysisCache = new Map<AdvancedSampleCacheKey, InternalGameAnalysis>();

export function resetAdvancedMetricsCache(): void {
  gameAnalysisCache.clear();
}

export function deriveAdvancedGameSample({
  record,
  normalized,
  canonicalPlayerId,
  roundSnapshots,
}: {
  record: GameRecord;
  normalized: NormalizedHistoricalGame;
  canonicalPlayerId: string;
  roundSnapshots: RoundSnapshotMap;
}): AdvancedGameSample {
  const cacheKey = `${record.id}::${canonicalPlayerId}`;
  const analysis = getOrAnalyzeGame(record, normalized, canonicalPlayerId, cacheKey);
  const roundResults = normalizeRoundResults(roundSnapshots);

  return Object.freeze({
    gameId: record.id,
    finishedAt: normalized.finishedAt,
    score: normalized.scores[canonicalPlayerId] ?? null,
    won: normalized.winnerIds.has(canonicalPlayerId),
    trumpSuit: analysis.trumpSuit,
    tricksWonBySuit: Object.freeze({ ...analysis.tricksWonBySuit }),
    tricksPlayedBySuit: Object.freeze({ ...analysis.tricksPlayedBySuit }),
    minScoreDiff: analysis.minScoreDiff,
    maxScoreDiff: analysis.maxScoreDiff,
    roundResults,
  });
}

export function deriveAdvancedMetrics({
  historicalGames,
  liveGame,
  windowSize = 5,
}: AdvancedMetricsInput): AdvancedMetricsResult | null {
  const samples: AdvancedGameSample[] = [];
  if (Array.isArray(historicalGames)) {
    samples.push(...historicalGames.filter(Boolean));
  }
  if (liveGame) {
    samples.push(liveGame);
  }

  if (samples.length === 0) {
    return null;
  }

  const trickEfficiency = calculateTrickEfficiency(samples);
  const suitMastery = calculateSuitMastery(samples);
  const scoreVolatility = calculateScoreVolatility(samples);
  const momentum = calculateMomentum(samples, windowSize);

  return Object.freeze({
    trickEfficiency,
    suitMastery,
    scoreVolatility,
    momentum,
  });
}

function calculateTrickEfficiency(
  samples: ReadonlyArray<AdvancedGameSample>,
): AdvancedMetricsResult['trickEfficiency'] {
  let deltaSum = 0;
  let deltaCount = 0;
  let perfectStreak = 0;
  let longestStreak = 0;

  const sequence: Array<{
    finishedAt: number;
    round: number;
    bid: number | null;
    actual: number | null;
  }> = [];

  for (const sample of samples) {
    for (const result of sample.roundResults) {
      if (result.bid != null && result.actual != null) {
        deltaSum += result.actual - result.bid;
        deltaCount += 1;
      }
      sequence.push({
        finishedAt: sample.finishedAt,
        round: result.round,
        bid: result.bid,
        actual: result.actual,
      });
    }
  }

  sequence.sort((a, b) => {
    if (a.finishedAt !== b.finishedAt) {
      return a.finishedAt - b.finishedAt;
    }
    return a.round - b.round;
  });

  for (const entry of sequence) {
    if (entry.bid != null && entry.actual != null && entry.bid === entry.actual) {
      perfectStreak += 1;
      if (perfectStreak > longestStreak) {
        longestStreak = perfectStreak;
      }
    } else if (entry.bid != null || entry.actual != null) {
      perfectStreak = 0;
    }
  }

  const averageDelta = deltaCount === 0 ? null : Math.round((deltaSum / deltaCount) * 10) / 10;

  return Object.freeze({
    averageDelta,
    perfectBidStreak: longestStreak,
  });
}

function calculateSuitMastery(
  samples: ReadonlyArray<AdvancedGameSample>,
): AdvancedMetricsResult['suitMastery'] {
  const trumpGames: Record<SuitKey, { wins: number; total: number }> = createSuitCounter(() => ({
    wins: 0,
    total: 0,
  }));
  const trickTotals: Record<SuitKey, { wins: number; total: number }> = createSuitCounter(() => ({
    wins: 0,
    total: 0,
  }));

  for (const sample of samples) {
    if (sample.trumpSuit) {
      trumpGames[sample.trumpSuit].total += 1;
      if (sample.won) {
        trumpGames[sample.trumpSuit].wins += 1;
      }
    }
    for (const suit of suitKeys) {
      const total = sample.tricksPlayedBySuit[suit] ?? 0;
      const wins = sample.tricksWonBySuit[suit] ?? 0;
      if (total > 0) {
        trickTotals[suit].total += total;
        trickTotals[suit].wins += wins;
      }
    }
  }

  const trumpWinRateBySuit: Record<SuitKey, number | null> = createSuitCounter(() => null);
  const trickSuccessBySuit: Record<SuitKey, number | null> = createSuitCounter(() => null);

  for (const suit of suitKeys) {
    const stats = trumpGames[suit];
    if (stats.total > 0) {
      const rate = stats.wins / stats.total;
      trumpWinRateBySuit[suit] = Math.round(rate * 1000) / 10;
    } else {
      trumpWinRateBySuit[suit] = null;
    }

    const trickStats = trickTotals[suit];
    if (trickStats.total >= 3) {
      const success = trickStats.wins / trickStats.total;
      trickSuccessBySuit[suit] = Math.round(success * 1000) / 10;
    } else {
      trickSuccessBySuit[suit] = null;
    }
  }

  return Object.freeze({
    trumpWinRateBySuit: Object.freeze({ ...trumpWinRateBySuit }),
    trickSuccessBySuit: Object.freeze({ ...trickSuccessBySuit }),
  });
}

function calculateScoreVolatility(
  samples: ReadonlyArray<AdvancedGameSample>,
): AdvancedMetricsResult['scoreVolatility'] {
  const scores: number[] = [];
  let largestComeback: number | null = null;
  let largestLeadBlown: number | null = null;

  for (const sample of samples) {
    if (Number.isFinite(sample.score ?? NaN)) {
      scores.push(Number(sample.score));
    }
    if (sample.won && sample.minScoreDiff != null && sample.minScoreDiff < 0) {
      const comeback = Math.abs(sample.minScoreDiff);
      if (largestComeback == null || comeback > largestComeback) {
        largestComeback = comeback;
      }
    }
    if (!sample.won && sample.maxScoreDiff != null && sample.maxScoreDiff > 0) {
      if (largestLeadBlown == null || sample.maxScoreDiff > largestLeadBlown) {
        largestLeadBlown = sample.maxScoreDiff;
      }
    }
  }

  const standardDeviation = computeStandardDeviation(scores);

  return Object.freeze({
    standardDeviation,
    largestComeback,
    largestLeadBlown,
  });
}

function calculateMomentum(
  samples: ReadonlyArray<AdvancedGameSample>,
  windowSize: number,
): AdvancedMetricsResult['momentum'] {
  const sorted = [...samples]
    .filter((sample) => Number.isFinite(sample.score ?? NaN))
    .sort((a, b) => a.finishedAt - b.finishedAt);

  const rollingAverageScores: Array<{ gameId: string; score: number; average: number }> = [];
  const scores: number[] = [];
  const wins: boolean[] = [];

  for (const sample of sorted) {
    const score = Number(sample.score);
    scores.push(score);
    wins.push(sample.won);
    const start = Math.max(0, scores.length - windowSize);
    const window = scores.slice(start);
    const average = window.reduce((total, value) => total + value, 0) / window.length;
    rollingAverageScores.push({
      gameId: sample.gameId,
      score,
      average: Math.round(average * 10) / 10,
    });
  }

  let longestWinStreak = 0;
  let runningStreak = 0;
  for (const won of wins) {
    if (won) {
      runningStreak += 1;
      if (runningStreak > longestWinStreak) {
        longestWinStreak = runningStreak;
      }
    } else {
      runningStreak = 0;
    }
  }

  let currentWinStreak = 0;
  for (let i = wins.length - 1; i >= 0; i -= 1) {
    if (wins[i]) {
      currentWinStreak += 1;
    } else {
      break;
    }
  }

  return Object.freeze({
    rollingAverageScores: Object.freeze(rollingAverageScores),
    currentWinStreak,
    longestWinStreak,
  });
}

function computeStandardDeviation(values: ReadonlyArray<number>): number | null {
  if (!values || values.length < 2) {
    return null;
  }
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - mean) * (value - mean), 0) / values.length;
  const deviation = Math.sqrt(variance);
  return Math.round(deviation * 10) / 10;
}

function normalizeRoundResults(
  roundSnapshots: RoundSnapshotMap,
): ReadonlyArray<AdvancedRoundResult> {
  const entries: Array<AdvancedRoundResult> = [];
  if (!roundSnapshots) {
    return entries;
  }
  for (const [roundKey, snapshot] of Object.entries(roundSnapshots)) {
    const round = Number(roundKey);
    if (!Number.isFinite(round) || !snapshot) continue;
    entries.push(
      Object.freeze({
        round,
        bid: snapshot.bid ?? null,
        actual: snapshot.actual ?? null,
      }),
    );
  }
  entries.sort((a, b) => a.round - b.round);
  return Object.freeze(entries);
}

function getOrAnalyzeGame(
  record: GameRecord,
  normalized: NormalizedHistoricalGame,
  canonicalPlayerId: string,
  cacheKey: AdvancedSampleCacheKey,
): InternalGameAnalysis {
  const cached = gameAnalysisCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const analysis = analyzeGame(record, normalized, canonicalPlayerId);
  gameAnalysisCache.set(cacheKey, analysis);
  return analysis;
}

function analyzeGame(
  record: GameRecord,
  normalized: NormalizedHistoricalGame,
  canonicalPlayerId: string,
): InternalGameAnalysis {
  const tricksWonBySuit = createSuitCounter(() => 0);
  const tricksPlayedBySuit = createSuitCounter(() => 0);

  const events = Array.isArray(record.bundle?.events)
    ? (record.bundle?.events as GameRecord['bundle']['events'])
    : [];

  let currentRoundTrump: SuitKey | null = null;
  let gameTrump: SuitKey | null = null;
  let currentLeadSuit: SuitKey | null = null;
  let currentTrickPlays: Array<{ playerId: string | null; suit: SuitKey | null }> = [];

  const scoreByPlayer = new Map<string, number>();
  for (const id of normalized.playerIds) {
    scoreByPlayer.set(id, 0);
  }

  let minScoreDiff: number | null = null;
  let maxScoreDiff: number | null = null;

  const normalizePlayerId = (rawId: unknown): string | null => {
    if (typeof rawId !== 'string') return null;
    const trimmed = rawId.trim();
    if (!trimmed) return null;
    if (normalized.playerIds.has(trimmed)) {
      return trimmed;
    }
    const alias = normalizeAlias(trimmed);
    if (alias && normalized.slotMapping?.aliasToId) {
      const mapped = normalized.slotMapping.aliasToId[alias];
      if (mapped && normalized.playerIds.has(mapped)) {
        return mapped;
      }
    }
    if (alias) {
      for (const [id, name] of Object.entries(normalized.namesById)) {
        if (typeof name !== 'string') continue;
        if (normalizeAlias(name) === alias && normalized.playerIds.has(id)) {
          return id;
        }
      }
    }
    return normalized.playerIds.has(trimmed) ? trimmed : null;
  };

  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const type = (event as { type?: unknown }).type;
    const payload = (event as { payload?: unknown }).payload;

    if (type === 'sp/deal' && payload && typeof payload === 'object') {
      const rawTrump = (payload as { trump?: unknown }).trump;
      const trump = normalizeSuit(rawTrump);
      if (trump) {
        currentRoundTrump = trump;
        if (!gameTrump) {
          gameTrump = trump;
        }
      }
      continue;
    }

    if (type === 'sp/trick/played' && payload && typeof payload === 'object') {
      const rawPlayerId = (payload as { playerId?: unknown }).playerId;
      const card = (payload as { card?: { suit?: unknown } }).card;
      const suit =
        card && typeof card === 'object' ? normalizeSuit((card as { suit?: unknown }).suit) : null;
      if (currentTrickPlays.length === 0) {
        currentLeadSuit = suit;
      }
      currentTrickPlays.push({
        playerId: normalizePlayerId(rawPlayerId),
        suit,
      });
      continue;
    }

    if (type === 'sp/trick/cleared' && payload && typeof payload === 'object') {
      const rawWinner = (payload as { winnerId?: unknown }).winnerId;
      const winnerId = normalizePlayerId(rawWinner);
      if (currentLeadSuit) {
        tricksPlayedBySuit[currentLeadSuit] += 1;
        if (winnerId === canonicalPlayerId) {
          tricksWonBySuit[currentLeadSuit] += 1;
        }
      }
      currentTrickPlays = [];
      currentLeadSuit = null;
      continue;
    }

    if (type === 'score/added' && payload && typeof payload === 'object') {
      const rawPlayerId = (payload as { playerId?: unknown }).playerId;
      const delta = Number((payload as { delta?: unknown }).delta);
      if (!Number.isFinite(delta)) continue;
      const playerId = normalizePlayerId(rawPlayerId);
      if (!playerId) continue;
      const previous = scoreByPlayer.get(playerId) ?? 0;
      const updated = previous + delta;
      scoreByPlayer.set(playerId, updated);
      let canonicalScore = scoreByPlayer.get(canonicalPlayerId);
      if (!Number.isFinite(canonicalScore)) {
        canonicalScore = 0;
      }
      let highestOther = Number.NEGATIVE_INFINITY;
      for (const [pid, score] of scoreByPlayer.entries()) {
        if (pid === canonicalPlayerId) continue;
        if (score > highestOther) {
          highestOther = score;
        }
      }
      if (!Number.isFinite(highestOther)) {
        highestOther = canonicalScore ?? 0;
      }
      const diff = (canonicalScore ?? 0) - highestOther;
      if (minScoreDiff == null || diff < minScoreDiff) {
        minScoreDiff = diff;
      }
      if (maxScoreDiff == null || diff > maxScoreDiff) {
        maxScoreDiff = diff;
      }
      continue;
    }
  }

  return Object.freeze({
    trumpSuit: gameTrump ?? currentRoundTrump ?? null,
    tricksWonBySuit,
    tricksPlayedBySuit,
    minScoreDiff,
    maxScoreDiff,
  });
}

function createSuitCounter<T>(factory: () => T): Record<SuitKey, T> {
  const counter: Partial<Record<SuitKey, T>> = {};
  for (const suit of suitKeys) {
    counter[suit] = factory();
  }
  return counter as Record<SuitKey, T>;
}

function normalizeSuit(value: unknown): SuitKey | null {
  if (typeof value !== 'string') return null;
  const lower = value.trim().toLocaleLowerCase();
  if (suitKeys.includes(lower as SuitKey)) {
    return lower as SuitKey;
  }
  return null;
}

const aliasWhitespace = /\s+/g;

function normalizeAlias(value: string): string {
  return value.trim().toLocaleLowerCase().replace(aliasWhitespace, ' ');
}
