'use client';

import React from 'react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { Button, Card, InlineEdit } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import {
  assertEntityAvailable,
  selectPlayerById,
  selectHumanIdFor,
  resolvePlayerRoute,
  createPendingPlayerStatisticsSummary,
  createEmptyPlayerStatisticsSummary,
  createErroredPlayerStatisticsSummary,
  loadPlayerStatisticsSummary,
  resetPlayerStatisticsCache,
  events,
  type PlayerStatisticsSummary,
} from '@/lib/state';
import { useGamesSignalSubscription } from '@/components/hooks';
import { trackPlayerDetailView } from '@/lib/observability/events';
import { useConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { useToast } from '@/components/ui/toast';
import { Archive, Undo2, User } from 'lucide-react';
import { captureBrowserException } from '@/lib/observability/browser';

import PlayerMissing from '../_components/PlayerMissing';
import { PrimaryStatsCard } from './statistics/components/PrimaryStatsCard';
import { SecondaryStatsCard } from './statistics/components/SecondaryStatsCard';
import { RoundAccuracyChart } from './statistics/components/RoundAccuracyChart';
import { HandInsightsCard } from './statistics/components/HandInsightsCard';
import { AdvancedInsightsPanel } from './statistics/components/AdvancedInsightsPanel';
import styles from './page.module.scss';

export type PlayerDetailPageProps = {
  playerId: string;
};

export function PlayerDetailPage({ playerId }: PlayerDetailPageProps) {
  const router = useRouter();
  const { state, ready, append } = useAppState();
  const confirmDialog = useConfirmDialog();
  const { toast } = useToast();

  // Force scroll to top immediately on component mount
  React.useEffect(() => {
    // Immediately scroll to top to prevent any scroll restoration
    if (typeof window !== 'undefined') {
      window.history.scrollRestoration = 'manual';
      window.scrollTo({ top: 0, left: 0 });
    }
  }, []); // Run once on mount

  const playerSlice = React.useMemo(() => selectPlayerById(state, playerId), [state, playerId]);
  const availability = React.useMemo(
    () =>
      ready
        ? assertEntityAvailable(playerSlice, 'player', {
            id: playerId,
            archived: playerSlice?.archived ?? false,
          })
        : null,
    [ready, playerSlice, playerId],
  );

  // Statistics loading logic
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
    if (!availability || availability.status !== 'found') {
      setSummary(null);
      return;
    }
    const targetPlayerId = availability.entity.id;
    if (!targetPlayerId) {
      setSummary(null);
      return;
    }
    const cacheKey = `${targetPlayerId}:${reloadKey}`;
    return refresh(targetPlayerId, cacheKey);
  }, [ready, availability, refresh, reloadKey]);

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
    }, 200);
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

  const resolvedSummary = summary;
  const isLoading =
    resolvedSummary?.isLoadingHistorical === true || resolvedSummary?.isLoadingLive === true;

  React.useEffect(() => {
    if (!ready) return;
    if (!availability || availability.status !== 'found') return;
    trackPlayerDetailView({
      playerId,
      archived: availability.entity?.detail?.archived ?? false,
      source: 'players.detail.page',
    });
  }, [ready, availability, playerId]);

  const handleArchivePlayer = React.useCallback(async () => {
    if (!availability || availability.status !== 'found') return;

    const playerDetail = availability.entity;
    const playerName = playerDetail?.name ?? playerDetail?.id ?? 'Unknown player';

    const confirmed = await confirmDialog({
      title: 'Archive player',
      description: `Archive ${playerName}? They will be removed from the active player list but can be restored later.`,
      confirmLabel: 'Archive player',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await append(events.playerRemoved({ id: playerId }));
      toast({
        title: 'Player archived',
        description: `${playerName} has been archived.`,
      });
      // Navigate to archived players list after a short delay
      setTimeout(() => {
        router.push(resolvePlayerRoute(null, { fallback: 'archived' }));
      }, 1000);
    } catch (error) {
      captureBrowserException(
        error instanceof Error ? error : new Error('Failed to archive player'),
        {
          scope: 'player-detail',
          action: 'archive-player',
          playerId,
        },
      );
      toast({
        title: 'Failed to archive player',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [availability, playerId, confirmDialog, append, toast, router]);

  const handleUnarchivePlayer = React.useCallback(async () => {
    if (!availability || availability.status !== 'found') return;

    const playerDetail = availability.entity;
    const playerName = playerDetail?.name ?? playerDetail?.id ?? 'Unknown player';

    const confirmed = await confirmDialog({
      title: 'Restore player',
      description: `Restore ${playerName} to the active player list?`,
      confirmLabel: 'Restore player',
      cancelLabel: 'Cancel',
    });

    if (!confirmed) return;

    try {
      await append(events.playerRestored({ id: playerId }));
      toast({
        title: 'Player restored',
        description: `${playerName} has been restored to the active player list.`,
      });
      // Navigate to main players list after a short delay
      setTimeout(() => {
        router.push('/players');
      }, 1000);
    } catch (error) {
      captureBrowserException(
        error instanceof Error ? error : new Error('Failed to restore player'),
        {
          scope: 'player-detail',
          action: 'restore-player',
          playerId,
        },
      );
      toast({
        title: 'Failed to restore player',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [availability, playerId, confirmDialog, append, toast, router]);

  // Player name editing handler
  const handleSavePlayerName = React.useCallback(
    async (newName: string) => {
      try {
        await append(events.playerRenamed({ id: playerId, name: newName }));
        toast({
          title: 'Player name updated',
          description: `Name changed to "${newName}"`,
        });
      } catch (error) {
        throw new Error('Failed to update player name');
      }
    },
    [playerId, append, toast],
  );

  // Player type change handler
  const handleChangePlayerType = React.useCallback(
    async (newType: 'human' | 'bot') => {
      try {
        await append(events.playerTypeSet({ id: playerId, type: newType }));
        toast({
          title: 'Player type updated',
          description: `Type changed to ${newType === 'bot' ? 'Bot' : 'Human'}`,
        });
      } catch (error) {
        throw new Error('Failed to update player type');
      }
    },
    [playerId, append, toast],
  );

  // Additional scroll fix when content changes to ensure top position
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0 });
    }
  }, [playerId]); // Run when playerId changes

  if (!ready) {
    return (
      <div className={styles.container}>
        <div className={styles.spinnerRow} role="status" aria-live="polite">
          <Loader2 className={styles.spinner} aria-hidden="true" />
          Loading player…
        </div>
      </div>
    );
  }

  if (!availability || availability.status !== 'found') {
    return <PlayerMissing />;
  }

  const detail = availability.entity;
  const archived = detail?.detail?.archived ?? false;
  const archivedAt = detail?.detail?.archivedAt ?? null;
  const type = detail?.detail?.type ?? 'human';

  // Check if this player is designated as the single-player human
  const isSinglePlayerHuman = React.useMemo(() => {
    const singlePlayerHumanId = selectHumanIdFor(state, 'single');
    return singlePlayerHumanId === playerId;
  }, [state, playerId]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        {archived ? (
          <Button
            variant="outline"
            onClick={() => router.push(resolvePlayerRoute(null, { fallback: 'archived' }))}
          >
            View archived list
          </Button>
        ) : null}
      </header>

      <Card className={styles.playerDetailsSection}>
        <div className={styles.playerDetailsHeader}>
          <h2 className={styles.playerDetailsTitle}>Player details</h2>
          <p className={styles.playerDetailsDescription}>
            Basic information and status for this player.
          </p>
        </div>
        <dl className={styles.playerDetailsList}>
          <div className={styles.playerDetailsItem}>
            <dt className={styles.playerDetailsTerm}>Name</dt>
            <dd className={styles.playerDetailsDescription}>
              <InlineEdit
                value={detail?.name ?? detail?.id ?? ''}
                onSave={handleSavePlayerName}
                placeholder="Player name"
                disabled={!ready}
                fontWeight={700}
                validate={(value) => {
                  if (!value.trim()) return 'Player name is required';
                  return null;
                }}
                saveLabel="Save"
                cancelLabel="Cancel"
                errorLabel="Failed to update player name"
              />
            </dd>
          </div>
          <div className={styles.playerDetailsItem}>
            <dt className={styles.playerDetailsTerm}>Type</dt>
            <dd className={styles.playerDetailsDescription}>
              <select
                value={type}
                onChange={(e) => void handleChangePlayerType(e.target.value as 'human' | 'bot')}
                disabled={!ready}
                className={styles.typeSelect}
              >
                <option value="human">Human</option>
                <option value="bot">Bot</option>
              </select>
            </dd>
          </div>
          {isSinglePlayerHuman && (
            <div className={styles.playerDetailsItem}>
              <dt className={styles.playerDetailsTerm}>Single Player</dt>
              <dd className={styles.playerDetailsDescription}>
                <span className={styles.singlePlayerHumanBadge}>
                  <User aria-hidden="true" /> Designated
                </span>
              </dd>
            </div>
          )}
          <div className={styles.playerDetailsItem}>
            <dt className={styles.playerDetailsTerm}>Status</dt>
            <dd className={styles.playerDetailsDescription}>
              <span
                className={clsx(
                  styles.playerBadge,
                  styles[archived ? 'archivedBadge' : 'activeBadge'],
                )}
              >
                {archived ? 'Archived' : 'Active'}
              </span>
            </dd>
          </div>
          <div className={styles.playerDetailsItem}>
            <dt className={styles.playerDetailsTerm}>Player ID</dt>
            <dd className={styles.playerDetailsDescription}>
              <code>{detail?.id}</code>
            </dd>
          </div>
          {archivedAt ? (
            <div className={styles.playerDetailsItem}>
              <dt className={styles.playerDetailsTerm}>Archived at</dt>
              <dd className={styles.playerDetailsDescription}>
                {new Date(archivedAt).toLocaleString()}
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>

      {/* Player Actions Section */}
      <Card className={styles.playerActionsSection}>
        <div className={styles.playerActionsHeader}>
          <h2 className={styles.playerActionsTitle}>Player Actions</h2>
          <p className={styles.playerActionsDescription}>
            Manage this player's status and availability.
          </p>
        </div>
        <div className={styles.playerActionsList}>
          {archived ? (
            <Button
              variant="outline"
              onClick={handleUnarchivePlayer}
              className={styles.actionButton}
            >
              <Undo2 aria-hidden="true" /> Restore Player
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={handleArchivePlayer}
              className={styles.actionButton}
            >
              <Archive aria-hidden="true" /> Archive Player
            </Button>
          )}
        </div>
      </Card>

      {/* Statistics Section - Following AdvancedInsightsPanel pattern */}
      <div className={styles.statisticsSection} aria-live="polite">
        <section className={styles.metricsCard} aria-label="Primary metrics">
          <header className={styles.cardHeading}>Primary metrics</header>
          {!resolvedSummary || isLoading ? (
            <div className={styles.primaryStatsSkeleton}>
              {[1, 2, 3].map((idx) => (
                <div key={`primary-${idx}`} className={styles.primaryMetricSkeleton}>
                  <div className={styles.primaryMetricLabel}></div>
                  <div className={styles.primaryMetricValue}></div>
                </div>
              ))}
            </div>
          ) : (
            <PrimaryStatsCard
              loading={isLoading}
              metrics={resolvedSummary?.primary ?? null}
              loadError={resolvedSummary?.loadError ?? null}
            />
          )}
        </section>

        <section className={styles.metricsCard} aria-label="Secondary metrics">
          <header className={styles.cardHeading}>Secondary metrics</header>
          {!resolvedSummary || isLoading ? (
            <div className={styles.secondaryStatsSkeleton}>
              {[1, 2, 3, 4, 5].map((idx) => (
                <div key={`secondary-${idx}`} className={styles.secondaryMetricSkeleton}>
                  <div className={styles.secondaryMetricIcon}></div>
                  <div className={styles.secondaryMetricContent}>
                    <div className={styles.secondaryMetricLabel}></div>
                    <div className={styles.secondaryMetricValue}></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <SecondaryStatsCard
              loading={isLoading}
              metrics={resolvedSummary?.secondary ?? null}
              loadError={resolvedSummary?.loadError ?? null}
            />
          )}
        </section>

        <section className={styles.metricsCard} aria-label="Round accuracy">
          <header className={styles.cardHeading}>Round accuracy</header>
          {isLoading ? (
            <div className={styles.roundAccuracySkeleton}>
              <div className={styles.roundAccuracyTableSkeleton}>
                <div className={styles.roundAccuracyHeaderSkeleton}>
                  <div className={styles.roundAccuracyHeaderCell}></div>
                  <div className={styles.roundAccuracyHeaderCell}></div>
                  <div className={styles.roundAccuracyHeaderCell}></div>
                  <div className={styles.roundAccuracyHeaderCell}></div>
                </div>
                <div className={styles.roundAccuracyRowsSkeleton}>
                  {[1, 2, 3].map((idx) => (
                    <div key={`round-row-${idx}`} className={styles.roundAccuracyRowSkeleton}>
                      <div className={styles.roundAccuracyCellSkeleton}></div>
                      <div className={styles.roundAccuracyCellSkeleton}></div>
                      <div className={styles.roundAccuracyCellSkeleton}></div>
                      <div className={styles.roundAccuracyCellSkeleton}></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.roundAccuracySummarySkeleton}>
                {[1, 2, 3, 4].map((idx) => (
                  <div
                    key={`round-summary-${idx}`}
                    className={styles.roundAccuracySummaryItemSkeleton}
                  >
                    <div className={styles.roundAccuracySummaryLabel}></div>
                    <div className={styles.roundAccuracySummaryValue}></div>
                    <div className={styles.roundAccuracySummaryDetail}></div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <RoundAccuracyChart
              loading={isLoading}
              metrics={resolvedSummary?.rounds ?? []}
              loadError={resolvedSummary?.loadError ?? null}
            />
          )}
        </section>

        <section className={styles.metricsCard} aria-label="Hand insights">
          <header className={styles.cardHeading}>Hand insights</header>
          {isLoading ? (
            <div className={styles.handInsightsSkeleton}>
              {[1, 2, 3].map((idx) => (
                <div key={`hand-${idx}`} className={styles.handInsightSkeleton}>
                  <div className={styles.handInsightLabel}></div>
                  <div className={styles.handInsightValue}></div>
                  <div className={styles.handInsightDetail}></div>
                </div>
              ))}
            </div>
          ) : (
            <HandInsightsCard
              loading={isLoading}
              insight={resolvedSummary?.handInsights ?? null}
              loadError={resolvedSummary?.loadError ?? null}
            />
          )}
        </section>

        <section className={styles.metricsCard} aria-label="Advanced analytics">
          <header className={styles.cardHeading}>Advanced analytics</header>
          {isLoading ? (
            <div className={styles.advancedAnalyticsSkeleton}>
              {/* Trick Efficiency Section */}
              <div className={styles.advancedSectionSkeleton}>
                <div className={styles.advancedSectionHeaderSkeleton}>
                  <div className={styles.advancedSectionIcon}></div>
                  <div className={styles.advancedSectionTitle}></div>
                </div>
                <div className={styles.advancedMetricGridSkeleton}>
                  {[1, 2, 3, 4].map((idx) => (
                    <div key={`trick-metric-${idx}`} className={styles.advancedMetricSkeleton}>
                      <div className={styles.advancedMetricLabel}></div>
                      <div className={styles.advancedMetricValue}></div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Suit Mastery Section */}
              <div className={styles.advancedSectionSkeleton}>
                <div className={styles.advancedSectionHeaderSkeleton}>
                  <div className={styles.advancedSectionIcon}></div>
                  <div className={styles.advancedSectionTitle}></div>
                </div>
                <div className={styles.advancedTableSkeleton}>
                  <div className={styles.advancedTableHeaderSkeleton}>
                    <div className={styles.advancedTableHeaderCell}></div>
                    <div className={styles.advancedTableHeaderCell}></div>
                    <div className={styles.advancedTableHeaderCell}></div>
                  </div>
                  <div className={styles.advancedTableRowsSkeleton}>
                    {[1, 2, 3, 4].map((idx) => (
                      <div key={`suit-row-${idx}`} className={styles.advancedTableRowSkeleton}>
                        <div className={styles.advancedTableCellSkeleton}></div>
                        <div className={styles.advancedTableCellSkeleton}></div>
                        <div className={styles.advancedTableCellSkeleton}></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Momentum Section */}
              <div className={styles.advancedSectionSkeleton}>
                <div className={styles.advancedSectionHeaderSkeleton}>
                  <div className={styles.advancedSectionIcon}></div>
                  <div className={styles.advancedSectionTitle}></div>
                </div>
                <div className={styles.advancedMetricGridSkeleton}>
                  {[1, 2].map((idx) => (
                    <div key={`momentum-metric-${idx}`} className={styles.advancedMetricSkeleton}>
                      <div className={styles.advancedMetricLabel}></div>
                      <div className={styles.advancedMetricValue}></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <AdvancedInsightsPanel
              loading={isLoading}
              metrics={resolvedSummary?.advanced ?? null}
              loadError={resolvedSummary?.loadError ?? null}
            />
          )}
        </section>
      </div>
    </div>
  );
}

export default PlayerDetailPage;
