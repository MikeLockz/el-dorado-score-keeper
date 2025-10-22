import type { GameRecord } from '../io';
import type { NormalizedHistoricalGame } from './cache';

export type SuitKey = 'clubs' | 'diamonds' | 'hearts' | 'spades';

export type SuitCounts = Readonly<Record<SuitKey, number>>;

export type HistoricalHandInsight = Readonly<{
  handsPlayed: number;
  suitCounts: SuitCounts;
}>;

type MutableSuitCounts = Record<SuitKey, number>;

type MutableHandInsight = {
  handsPlayed: number;
  suitCounts: MutableSuitCounts;
};

type DerivedHandInsights = Readonly<Record<string, HistoricalHandInsight>>;

const suitKeys: ReadonlyArray<SuitKey> = Object.freeze(['clubs', 'diamonds', 'hearts', 'spades']);

const emptySuitCounts: SuitCounts = Object.freeze({
  clubs: 0,
  diamonds: 0,
  hearts: 0,
  spades: 0,
});

const derivedCache = new Map<string, DerivedHandInsights>();

export function resetHistoricalHandInsightsCache(): void {
  derivedCache.clear();
}

export function getHandInsightsForPlayer(
  record: GameRecord,
  normalized: NormalizedHistoricalGame,
  playerId: string,
): HistoricalHandInsight | null {
  if (!playerId) return null;
  const cacheKey = typeof record.id === 'string' ? record.id.trim() : '';
  const derived = getOrDeriveHandInsights(record, normalized, cacheKey);
  const insight = derived[playerId];
  return insight ?? null;
}

export function getOrDeriveHandInsights(
  record: GameRecord,
  normalized: NormalizedHistoricalGame,
  cacheKey: string,
): DerivedHandInsights {
  if (cacheKey) {
    const cached = derivedCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const result: Record<string, HistoricalHandInsight> = {};
  const mutable = deriveMutableHandInsights(record, normalized);

  for (const [playerId, bucket] of mutable.entries()) {
    result[playerId] = Object.freeze({
      handsPlayed: bucket.handsPlayed,
      suitCounts: Object.freeze({ ...bucket.suitCounts }),
    });
  }

  const frozen = Object.freeze(result);
  if (cacheKey) {
    derivedCache.set(cacheKey, frozen);
  }
  return frozen;
}

export function createEmptyHandInsight(): HistoricalHandInsight {
  return Object.freeze({
    handsPlayed: 0,
    suitCounts: emptySuitCounts,
  });
}

function deriveMutableHandInsights(
  record: GameRecord,
  normalized: NormalizedHistoricalGame,
): Map<string, MutableHandInsight> {
  const events = Array.isArray(record.bundle?.events)
    ? record.bundle?.events
    : [];

  const insights = new Map<string, MutableHandInsight>();

  const getBucket = (playerId: string): MutableHandInsight => {
    const existing = insights.get(playerId);
    if (existing) {
      return existing;
    }
    const next: MutableHandInsight = {
      handsPlayed: 0,
      suitCounts: createMutableSuitCounts(),
    };
    insights.set(playerId, next);
    return next;
  };

  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const type = (event as { type?: unknown }).type;
    if (type !== 'sp/trick/played') continue;
    const payload = (event as { payload?: unknown }).payload;
    if (!payload || typeof payload !== 'object') continue;
    const rawPlayerId = (payload as { playerId?: unknown }).playerId;
    const card = (payload as { card?: unknown }).card;
    if (!card || typeof card !== 'object') continue;
    const suit = (card as { suit?: unknown }).suit;
    const normalizedSuit = normalizeSuit(suit);
    if (!normalizedSuit) continue;
    const canonicalId = normalizePlayerId(rawPlayerId, normalized);
    if (!canonicalId) continue;
    const bucket = getBucket(canonicalId);
    bucket.handsPlayed += 1;
    bucket.suitCounts[normalizedSuit] += 1;
  }

  return insights;
}

function createMutableSuitCounts(): MutableSuitCounts {
  return {
    clubs: 0,
    diamonds: 0,
    hearts: 0,
    spades: 0,
  };
}

function normalizePlayerId(
  rawPlayerId: unknown,
  normalized: NormalizedHistoricalGame,
): string | null {
  if (typeof rawPlayerId !== 'string') return null;
  const trimmed = rawPlayerId.trim();
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
}

function normalizeAlias(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function normalizeSuit(value: unknown): SuitKey | null {
  if (typeof value !== 'string') return null;
  const lower = value.toLocaleLowerCase();
  return suitKeys.includes(lower as SuitKey) ? (lower as SuitKey) : null;
}
