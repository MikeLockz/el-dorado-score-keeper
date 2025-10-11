import type { GameRecord } from '../io';
import type { NormalizedHistoricalGame } from './cache';

type BidAccuracyTally = Readonly<{
  matches: number;
  total: number;
}>;

type BidAccuracyMap = Readonly<Record<string, BidAccuracyTally>>;

type MutableBidAccuracyMap = Record<string, { matches: number; total: number }>;

type HistoricalSecondaryMetrics = Readonly<{
  bidAccuracyByPlayer: BidAccuracyMap;
}>;

const secondaryMetricsCache = new Map<string, HistoricalSecondaryMetrics>();

export function resetHistoricalSecondaryMetricsCache(): void {
  secondaryMetricsCache.clear();
}

export function deriveHistoricalSecondaryMetrics(
  record: GameRecord,
  normalized: NormalizedHistoricalGame,
): HistoricalSecondaryMetrics {
  const cacheKey = typeof record.id === 'string' ? record.id.trim() : '';
  if (cacheKey && secondaryMetricsCache.has(cacheKey)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- cache guarded above
    return secondaryMetricsCache.get(cacheKey)!;
  }

  const bidsByRound = new Map<number, Map<string, number>>();
  const talliesByRound = new Map<number, Map<string, number>>();

  const getBidRound = (round: number): Map<string, number> => {
    let bucket = bidsByRound.get(round);
    if (!bucket) {
      bucket = new Map<string, number>();
      bidsByRound.set(round, bucket);
    }
    return bucket;
  };

  const getTallyRound = (round: number): Map<string, number> => {
    let bucket = talliesByRound.get(round);
    if (!bucket) {
      bucket = new Map<string, number>();
      talliesByRound.set(round, bucket);
    }
    return bucket;
  };

  const recordEvents = Array.isArray(record.bundle?.events) ? record.bundle.events : [];
  for (const event of recordEvents) {
    if (!event || typeof event !== 'object') continue;
    const type = (event as { type?: unknown }).type;
    const payload = (event as { payload?: unknown }).payload;

    if (type === 'bid/set' && payload && typeof payload === 'object') {
      const rawRound = (payload as { round?: unknown }).round;
      const rawPlayerId = (payload as { playerId?: unknown }).playerId;
      const rawBid = (payload as { bid?: unknown }).bid;
      if (!isFiniteNumber(rawRound) || !isFiniteNumber(rawBid) || typeof rawPlayerId !== 'string') {
        continue;
      }
      const playerId = normalizeId(rawPlayerId);
      if (!playerId) continue;
      const round = Math.trunc(Number(rawRound));
      const bid = Math.trunc(Number(rawBid));
      getBidRound(round).set(playerId, bid);
    } else if (type === 'sp/round-tally-set' && payload && typeof payload === 'object') {
      const rawRound = (payload as { round?: unknown }).round;
      const tallies = (payload as { tallies?: unknown }).tallies;
      if (!isFiniteNumber(rawRound) || !tallies || typeof tallies !== 'object') continue;
      const round = Math.trunc(Number(rawRound));
      const roundTallies = getTallyRound(round);
      for (const [rawId, rawValue] of Object.entries(tallies as Record<string, unknown>)) {
        const playerId = normalizeId(rawId);
        if (!playerId || !isFiniteNumber(rawValue)) continue;
        roundTallies.set(playerId, Math.trunc(Number(rawValue)));
      }
    }
  }

  const summaryTallies = record.summary?.sp?.roundTallies ?? {};
  if (summaryTallies && typeof summaryTallies === 'object') {
    for (const [roundKey, tallies] of Object.entries(summaryTallies)) {
      const round = Number(roundKey);
      if (!Number.isFinite(round) || !tallies || typeof tallies !== 'object') continue;
      const roundTallies = getTallyRound(Math.trunc(round));
      for (const [rawId, rawValue] of Object.entries(tallies as Record<string, unknown>)) {
        const playerId = normalizeId(rawId);
        if (!playerId || !isFiniteNumber(rawValue)) continue;
        roundTallies.set(playerId, Math.trunc(Number(rawValue)));
      }
    }
  }

  const accuracyTotals: MutableBidAccuracyMap = {};
  const rounds = new Set<number>([
    ...Array.from(bidsByRound.keys()),
    ...Array.from(talliesByRound.keys()),
  ]);

  for (const round of rounds) {
    const tallies = talliesByRound.get(round);
    if (!tallies || tallies.size === 0) continue;
    const bids = bidsByRound.get(round);
    for (const [playerId, actual] of tallies) {
      if (!normalized.playerIds.has(playerId)) continue;
      if (!Number.isFinite(actual)) continue;
      const bid = bids?.get(playerId);
      if (!Number.isFinite(bid)) continue;
      const bucket = (accuracyTotals[playerId] ??= { matches: 0, total: 0 });
      bucket.total += 1;
      if (actual === bid) {
        bucket.matches += 1;
      }
    }
  }

  const frozenAccuracy: Record<string, BidAccuracyTally> = {};
  for (const [playerId, stats] of Object.entries(accuracyTotals)) {
    frozenAccuracy[playerId] = Object.freeze({ matches: stats.matches, total: stats.total });
  }

  const result: HistoricalSecondaryMetrics = Object.freeze({
    bidAccuracyByPlayer: Object.freeze(frozenAccuracy),
  });

  if (cacheKey) {
    secondaryMetricsCache.set(cacheKey, result);
  }

  return result;
}

function isFiniteNumber(value: unknown): value is number {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed);
  }
  return false;
}

function normalizeId(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed;
}
