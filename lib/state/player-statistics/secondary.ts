import type { GameRecord } from '../io';
import type { NormalizedHistoricalGame } from './cache';

type BidAccuracyTally = Readonly<{
  matches: number;
  total: number;
}>;

type BidAccuracyMap = Readonly<Record<string, BidAccuracyTally>>;

type MutableBidAccuracyMap = Record<string, { matches: number; total: number }>;

type HistoricalRoundSnapshot = Readonly<{
  bid: number | null;
  actual: number | null;
}>;

type HistoricalRoundSnapshotMap = Readonly<Record<number, HistoricalRoundSnapshot>>;

type MutableRoundSnapshotMap = Record<number, { bid: number | null; actual: number | null }>;

type HistoricalSecondaryMetrics = Readonly<{
  bidAccuracyByPlayer: BidAccuracyMap;
  roundSnapshotsByPlayer: Readonly<Record<string, HistoricalRoundSnapshotMap>>;
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
  if (cacheKey) {
    const cached = secondaryMetricsCache.get(cacheKey);
    if (cached) {
      return cached;
    }
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

  const recordEvents: ReadonlyArray<GameRecord['bundle']['events'][number]> = Array.isArray(
    record.bundle?.events,
  )
    ? (record.bundle?.events as GameRecord['bundle']['events'])
    : [];
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
      const playerId = normalizeId(rawPlayerId, normalized);
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
        const playerId = normalizeId(rawId, normalized);
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
        const playerId = normalizeId(rawId, normalized);
        if (!playerId || !isFiniteNumber(rawValue)) continue;
        roundTallies.set(playerId, Math.trunc(Number(rawValue)));
      }
    }
  }

  const accuracyTotals: MutableBidAccuracyMap = {};
  const roundSnapshotsByPlayer: Record<string, MutableRoundSnapshotMap> = {};
  const rounds = new Set<number>([
    ...Array.from(bidsByRound.keys()),
    ...Array.from(talliesByRound.keys()),
  ]);

  const registerSnapshot = (
    playerId: string,
    round: number,
    bidValue: number | undefined,
    actualValue: number | undefined,
  ) => {
    const playerSnapshots = (roundSnapshotsByPlayer[playerId] ??= {});
    const existing = playerSnapshots[round] ?? { bid: null, actual: null };
    const bid =
      bidValue !== undefined && Number.isFinite(bidValue) ? Math.trunc(bidValue) : existing.bid;
    const actual =
      actualValue !== undefined && Number.isFinite(actualValue)
        ? Math.trunc(actualValue)
        : existing.actual;
    playerSnapshots[round] = { bid, actual };
  };

  for (const round of rounds) {
    const tallies = talliesByRound.get(round);
    const bids = bidsByRound.get(round);

    const players = new Set<string>();
    if (tallies) {
      for (const playerId of tallies.keys()) {
        players.add(playerId);
      }
    }
    if (bids) {
      for (const playerId of bids.keys()) {
        players.add(playerId);
      }
    }

    for (const playerId of players) {
      const actual = tallies?.get(playerId);
      const bid = bids?.get(playerId);

      registerSnapshot(playerId, round, bid, actual);

      if (typeof actual !== 'number' || typeof bid !== 'number') continue;
      const numericActual = actual;
      const numericBid = bid;
      const bucket = (accuracyTotals[playerId] ??= { matches: 0, total: 0 });
      bucket.total += 1;
      if (numericActual === numericBid) {
        bucket.matches += 1;
      }
    }
  }

  const frozenSnapshots: Record<string, HistoricalRoundSnapshotMap> = {};
  for (const [playerId, snapshots] of Object.entries(roundSnapshotsByPlayer)) {
    const roundsForPlayer: Record<number, HistoricalRoundSnapshot> = {};
    for (const [roundKey, snapshot] of Object.entries(snapshots)) {
      const round = Number(roundKey);
      if (!Number.isFinite(round)) continue;
      roundsForPlayer[round] = Object.freeze({
        bid: snapshot.bid,
        actual: snapshot.actual,
      });
    }
    frozenSnapshots[playerId] = Object.freeze(roundsForPlayer);
  }

  const frozenAccuracy: Record<string, BidAccuracyTally> = {};
  for (const [playerId, stats] of Object.entries(accuracyTotals)) {
    frozenAccuracy[playerId] = Object.freeze({ matches: stats.matches, total: stats.total });
  }

  const result: HistoricalSecondaryMetrics = Object.freeze({
    bidAccuracyByPlayer: Object.freeze(frozenAccuracy),
    roundSnapshotsByPlayer: Object.freeze(frozenSnapshots),
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

function normalizeId(value: unknown, game: NormalizedHistoricalGame): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (game.playerIds.has(trimmed)) {
    return trimmed;
  }
  const normalizedAlias = normalizeAlias(trimmed);
  const aliasMatch = normalizedAlias
    ? (game.slotMapping?.aliasToId?.[normalizedAlias] ?? null)
    : null;
  if (aliasMatch && game.playerIds.has(aliasMatch)) {
    return aliasMatch;
  }
  if (normalizedAlias) {
    for (const [id, name] of Object.entries(game.namesById)) {
      if (
        typeof name === 'string' &&
        normalizeAlias(name) === normalizedAlias &&
        game.playerIds.has(id)
      ) {
        return id;
      }
    }
  }
  return trimmed;
}

function normalizeAlias(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}
