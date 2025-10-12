import type { RosterSnapshot, SummarySlotMapping } from '../io';
import { captureBrowserMessage } from '@/lib/observability/browser';

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

const cacheTelemetryEnabled = (() => {
  const flag =
    process.env.NEXT_PUBLIC_PLAYER_STATS_CACHE_LOGS ??
    process.env.PLAYER_STATS_CACHE_LOGS ??
    process.env.NEXT_PUBLIC_ENABLE_PLAYER_STATS_CACHE_LOGS ??
    process.env.ENABLE_PLAYER_STATS_CACHE_LOGS;
  if (typeof flag === 'string') {
    const normalized = flag.trim().toLowerCase();
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  }
  return process.env.NODE_ENV !== 'production';
})();

const logCacheEvent = (event: 'hit' | 'miss' | 'store' | 'reset', gameId?: string) => {
  if (!cacheTelemetryEnabled) return;
  try {
    captureBrowserMessage(`player-stats.cache.${event}`, {
      level: 'info',
      attributes: {
        cache: 'historical-game',
        gameId: gameId ?? null,
      },
    });
  } catch {}
};

export function getCachedHistoricalGame(gameId: string): NormalizedHistoricalGame | null {
  const key = typeof gameId === 'string' ? gameId.trim() : '';
  if (!key) return null;
  const cached = historicalGameCache.get(key) ?? null;
  logCacheEvent(cached ? 'hit' : 'miss', key);
  return cached;
}

export function setCachedHistoricalGame(
  gameId: string,
  value: NormalizedHistoricalGame,
): NormalizedHistoricalGame {
  const key = typeof gameId === 'string' ? gameId.trim() : '';
  if (!key) return value;
  historicalGameCache.set(key, value);
  logCacheEvent('store', key);
  return value;
}

export function resetPlayerStatisticsCache(): void {
  historicalGameCache.clear();
  logCacheEvent('reset');
}
