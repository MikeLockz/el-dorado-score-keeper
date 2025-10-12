'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { Card, Label, Skeleton } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import {
  selectPlayerById,
  selectPlayersOrdered,
  resolvePlayerRoute,
  createPendingPlayerStatisticsSummary,
  createEmptyPlayerStatisticsSummary,
  createErroredPlayerStatisticsSummary,
  loadPlayerStatisticsSummary,
  resetPlayerStatisticsCache,
  type PlayerStatisticsSummary,
} from '@/lib/state';
import { useGamesSignalSubscription } from '@/components/hooks';
import { captureBrowserMessage } from '@/lib/observability/browser';

import PlayerMissing from '../../_components/PlayerMissing';
import { PrimaryStatsCard } from './components/PrimaryStatsCard';
import { SecondaryStatsCard } from './components/SecondaryStatsCard';
import { RoundAccuracyChart } from './components/RoundAccuracyChart';
import { HandInsightsCard } from './components/HandInsightsCard';
import { AdvancedInsightsPanel } from './components/AdvancedInsightsPanel';
import styles from './page.module.scss';

export type PlayerStatisticsViewProps = {
  playerId: string;
};

const skeletonItems = Array.from({ length: 3 });

export function PlayerStatisticsView({ playerId }: PlayerStatisticsViewProps): JSX.Element {
  const router = useRouter();
  const { state, ready } = useAppState();
  const trimmedPlayerId = React.useMemo(() => playerId.trim(), [playerId]);
  const players = React.useMemo(() => selectPlayersOrdered(state), [state]);
  const hasPlayers = players.length > 0;

  React.useEffect(() => {
    if (!ready) return;
    if (trimmedPlayerId) return;
    const fallbackId = players[0]?.id;
    if (!fallbackId) return;
    router.replace(resolvePlayerRoute(fallbackId, { view: 'statistics' }));
  }, [ready, trimmedPlayerId, players, router]);

  const selectedPlayer = React.useMemo(
    () => (trimmedPlayerId ? selectPlayerById(state, trimmedPlayerId) : null),
    [state, trimmedPlayerId],
  );
  const targetPlayerId = selectedPlayer?.id ?? null;
  const showMissing = trimmedPlayerId !== '' && !selectedPlayer;

  const [summary, setSummary] = React.useState<PlayerStatisticsSummary | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const crossTabDebounceRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (crossTabDebounceRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(crossTabDebounceRef.current);
      }
    };
  }, []);

  const refresh = React.useCallback((id: string, cacheKey: string) => {
    setSummary(createPendingPlayerStatisticsSummary(id));
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = stateRef.current;
        const result = await loadPlayerStatisticsSummary({
          playerId: id,
          stateSnapshot: snapshot,
          cacheKey,
        });
        if (cancelled) return;
        setSummary(result ?? createEmptyPlayerStatisticsSummary(id));
      } catch (error: unknown) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : 'Unable to load player statistics.';
        setSummary(createErroredPlayerStatisticsSummary(id, message));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!ready) {
      setSummary(null);
      return;
    }
    if (!targetPlayerId) {
      setSummary(null);
      return;
    }
    const cacheKey = `${targetPlayerId}:${reloadKey}`;
    return refresh(targetPlayerId, cacheKey);
  }, [ready, refresh, targetPlayerId, reloadKey]);

  const enqueueCrossTabRefresh = React.useCallback((reason: string) => {
    if (typeof window === 'undefined') {
      resetPlayerStatisticsCache();
      setReloadKey((key) => key + 1);
      return;
    }
    if (crossTabDebounceRef.current !== null) {
      window.clearTimeout(crossTabDebounceRef.current);
    }
    crossTabDebounceRef.current = window.setTimeout(() => {
      crossTabDebounceRef.current = null;
      resetPlayerStatisticsCache();
      setReloadKey((key) => key + 1);
      captureBrowserMessage('player-stats.refresh.applied', {
        level: 'info',
        attributes: { reason },
      });
    }, 200);
    captureBrowserMessage('player-stats.refresh.queued', {
      level: 'info',
      attributes: { reason },
    });
  }, []);

  useGamesSignalSubscription(
    React.useCallback(
      (signal) => {
        if (signal.type === 'added' || signal.type === 'deleted') {
          enqueueCrossTabRefresh(signal.type);
        }
      },
      [enqueueCrossTabRefresh],
    ),
    { enabled: ready },
  );

  const handlePlayerChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextId = event.target.value;
      if (!nextId) return;
      router.replace(resolvePlayerRoute(nextId, { view: 'statistics' }));
    },
    [router],
  );

  const resolvedSummary = summary;
  const isLoading =
    resolvedSummary?.isLoadingHistorical === true || resolvedSummary?.isLoadingLive === true;
  const showPrimarySkeleton = !resolvedSummary || isLoading;
  const showSecondarySkeleton = !resolvedSummary || isLoading;

  if (!ready) {
    return (
      <div className={styles.page}>
        <div className={styles.feedback} role="status" aria-live="polite">
          <Loader2 className={styles.spinner} aria-hidden="true" />
          Loading player statistics…
        </div>
      </div>
    );
  }

  if (!hasPlayers) {
    return (
      <div className={styles.page}>
        <Card className={styles.emptyCard}>
          <div className={styles.emptyTitle}>No players yet</div>
          <p className={styles.emptyDescription}>
            Add players from the roster to view statistics and history.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Player statistics</h1>
          <div className={styles.subtitle}>
            Analyze long-term performance, bid accuracy, and momentum.
          </div>
        </div>
        <div className={styles.selector}>
          <Label htmlFor="player-statistics-select">Player</Label>
          <select
            id="player-statistics-select"
            className={styles.selectControl}
            value={targetPlayerId ?? ''}
            onChange={handlePlayerChange}
          >
            {targetPlayerId == null ? (
              <option value="" disabled>
                Select a player
              </option>
            ) : null}
            {players.map((playerOption) => (
              <option key={playerOption.id} value={playerOption.id}>
                {playerOption.name} {playerOption.archived ? '(Archived)' : ''}
              </option>
            ))}
          </select>
        </div>
      </header>

      {showMissing ? (
        <div className={styles.missing}>
          <PlayerMissing />
        </div>
      ) : null}

      {resolvedSummary?.loadError ? (
        <Card className={styles.errorCard} role="alert">
          <div className={styles.errorTitle}>Unable to load statistics</div>
          <div className={styles.errorDescription}>{resolvedSummary.loadError}</div>
        </Card>
      ) : null}

      <div className={styles.sectionGrid} aria-live="polite">
        <Card className={styles.metricsCard}>
          <div className={styles.cardHeading}>Primary metrics</div>
          {showPrimarySkeleton ? (
            <div className={styles.skeletonList}>
              {skeletonItems.map((_, idx) => (
                <Skeleton key={`primary-${idx}`} className={styles.skeletonLine} />
              ))}
            </div>
          ) : (
            <PrimaryStatsCard
              loading={isLoading}
              metrics={resolvedSummary?.primary ?? null}
              loadError={resolvedSummary?.loadError}
            />
          )}
        </Card>

        <Card className={styles.metricsCard}>
          <div className={styles.cardHeading}>Secondary metrics</div>
          {showSecondarySkeleton ? (
            <div className={styles.skeletonList}>
              {skeletonItems.map((_, idx) => (
                <Skeleton key={`secondary-${idx}`} className={styles.skeletonLine} />
              ))}
            </div>
          ) : (
            <SecondaryStatsCard
              loading={isLoading}
              metrics={resolvedSummary?.secondary ?? null}
              loadError={resolvedSummary?.loadError}
            />
          )}
        </Card>

        <Card className={styles.metricsCard}>
          <div className={styles.cardHeading}>Round accuracy</div>
          {isLoading ? (
            <div className={styles.skeletonGrid}>
              {skeletonItems.map((_, idx) => (
                <Skeleton key={`round-${idx}`} className={styles.skeletonBlock} />
              ))}
            </div>
          ) : (
            <RoundAccuracyChart
              loading={isLoading}
              metrics={resolvedSummary?.rounds ?? []}
              loadError={resolvedSummary?.loadError}
            />
          )}
        </Card>

        <Card className={styles.metricsCard}>
          <div className={styles.cardHeading}>Hand insights</div>
          {isLoading ? (
            <div className={styles.skeletonList}>
              {skeletonItems.map((_, idx) => (
                <Skeleton key={`hand-${idx}`} className={styles.skeletonLine} />
              ))}
            </div>
          ) : (
            <HandInsightsCard
              loading={isLoading}
              insight={resolvedSummary?.handInsights ?? null}
              loadError={resolvedSummary?.loadError}
            />
          )}
        </Card>

        <Card className={styles.metricsCard}>
          <div className={styles.cardHeading}>Advanced analytics</div>
          {isLoading ? (
            <div className={styles.skeletonGrid}>
              {skeletonItems.map((_, idx) => (
                <Skeleton key={`advanced-${idx}`} className={styles.skeletonBlock} />
              ))}
            </div>
          ) : (
            <AdvancedInsightsPanel
              loading={isLoading}
              metrics={resolvedSummary?.advanced ?? null}
              loadError={resolvedSummary?.loadError}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
