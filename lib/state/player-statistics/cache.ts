import type { RosterSnapshot, SummarySlotMapping } from '../io';

export type NormalizedHistoricalGame = Readonly<{
  id: string;
  finishedAt: number;
  metadataVersion: number;
  playerIds: ReadonlySet<string>;
  scores: Readonly<Record<string, number>>;
  winnerIds: ReadonlySet<string>;
  namesById: Readonly<Record<string, string>>;
  rosterSnapshot: RosterSnapshot | null;
  slotMapping: SummarySlotMapping | null;
}>;

const historicalGameCache = new Map<string, NormalizedHistoricalGame>();

export function getCachedHistoricalGame(gameId: string): NormalizedHistoricalGame | null {
  const key = typeof gameId === 'string' ? gameId.trim() : '';
  if (!key) return null;
  return historicalGameCache.get(key) ?? null;
}

export function setCachedHistoricalGame(
  gameId: string,
  value: NormalizedHistoricalGame,
): NormalizedHistoricalGame {
  const key = typeof gameId === 'string' ? gameId.trim() : '';
  if (!key) return value;
  historicalGameCache.set(key, value);
  return value;
}

export function resetPlayerStatisticsCache(): void {
  historicalGameCache.clear();
}
