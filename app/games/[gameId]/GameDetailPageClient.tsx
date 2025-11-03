'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

import { Button, Card, InlineEdit } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import ScorecardGrid, {
  type ScorecardPlayerColumn,
  type ScorecardRoundEntry,
  type ScorecardRoundView,
} from '@/components/views/scorecard/ScorecardGrid';
import { deleteGame } from '@/lib/state';
import { useConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { useToast } from '@/components/ui/toast';
import { captureBrowserException } from '@/lib/observability/browser';
import { Archive, Play } from 'lucide-react';
import {
  type AppState,
  type GameRecord,
  getGame,
  resolveGameModalRoute,
  isGameRecordCompleted,
  INITIAL_STATE,
  reduce,
  selectPlayersOrdered,
  selectPlayersOrderedFor,
  selectCumulativeScoresAllRounds,
  selectRoundInfosAll,
  ROUNDS_TOTAL,
  tricksForRound,
  updateGameTitle,
  restoreGame,
  deriveGameMode,
} from '@/lib/state';
import { analyzeGame } from '@/lib/analytics';
import { formatDateTime } from '@/lib/format';
import { formatDuration } from '@/lib/utils';
import { captureBrowserMessage } from '@/lib/observability/browser';
import { resolveSinglePlayerRoute, resolveScorecardRoute } from '@/lib/state';
import ArchivedGameMissing from '../_components/ArchivedGameMissing';
import { subscribeToGamesSignal } from '@/lib/state/game-signals';
import { trackGameDetailView } from '@/lib/observability/events';

import styles from './page.module.scss';

export type GameDetailPageClientProps = {
  gameId: string;
};

type ReadOnlyScorecardGrid = {
  columns: ReadonlyArray<ScorecardPlayerColumn>;
  rounds: ReadonlyArray<ScorecardRoundView>;
};

type ReadOnlyScorecardOptions = {
  slotMapping?: GameRecord['summary']['slotMapping'] | null;
  playerLimit?: number | null;
};

function normalizeAlias(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s+/g, ' ').toLocaleLowerCase();
}

function buildReadOnlyScorecardGrid(
  state: AppState,
  mode: 'scorecard' | 'single-player',
  options?: Readonly<ReadOnlyScorecardOptions>,
): Readonly<ReadOnlyScorecardGrid> | null {
  const rosterMode = mode === 'single-player' ? 'single' : 'scorecard';
  const rosterPlayers = selectPlayersOrderedFor(state, rosterMode);
  const fallbackPlayers = selectPlayersOrdered(state);
  const initialPlayers = rosterPlayers.length > 0 ? rosterPlayers : fallbackPlayers;
  if (initialPlayers.length === 0) return null;

  const rawLimit = options?.playerLimit;
  const normalizedLimit =
    typeof rawLimit === 'number' && Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.floor(rawLimit)
      : null;
  let players = [...initialPlayers];

  const aliasMap = options?.slotMapping?.aliasToId;
  if (aliasMap && Object.keys(aliasMap).length > 0) {
    const byId = new Map(players.map((player) => [player.id, player]));
    const seen = new Set<string>();
    const ordered: typeof players = [];
    const seatCap = normalizedLimit ?? players.length;
    for (let seat = 1; seat <= seatCap; seat++) {
      const aliases = [`player ${seat}`, `player${seat}`, `p${seat}`];
      let matchedId: string | null = null;
      for (const alias of aliases) {
        const normalizedAlias = normalizeAlias(alias);
        if (!normalizedAlias) continue;
        const candidateId = aliasMap[normalizedAlias];
        if (candidateId && byId.has(candidateId)) {
          matchedId = candidateId;
          break;
        }
      }
      if (matchedId && !seen.has(matchedId)) {
        const player = byId.get(matchedId);
        if (player) {
          ordered.push(player);
          seen.add(matchedId);
        }
      }
    }
    for (const player of players) {
      if (normalizedLimit && ordered.length >= normalizedLimit) break;
      if (seen.has(player.id)) continue;
      ordered.push(player);
      seen.add(player.id);
    }
    players = normalizedLimit ? ordered.slice(0, normalizedLimit) : ordered;
  } else if (normalizedLimit != null) {
    players = players.slice(0, normalizedLimit);
  }

  if (players.length === 0) return null;

  const columns: ScorecardPlayerColumn[] = players.map((player) => ({
    id: player.id,
    name: player.name,
  }));

  const totalsByRound = selectCumulativeScoresAllRounds(state);
  const roundInfoByRound = selectRoundInfosAll(state);

  const rounds: ScorecardRoundView[] = Array.from({ length: ROUNDS_TOTAL }, (_, index) => {
    const round = index + 1;
    const roundData = state.rounds[round];
    const info = roundInfoByRound[round];
    const stateValue = roundData?.state ?? 'locked';
    const entries: Record<string, ScorecardRoundEntry> = {};

    for (const column of columns) {
      const present = roundData?.present?.[column.id] !== false;
      entries[column.id] = {
        bid: present ? (roundData?.bids?.[column.id] ?? 0) : 0,
        made: present ? (roundData?.made?.[column.id] ?? null) : null,
        present,
        cumulative: totalsByRound[round]?.[column.id] ?? 0,
        placeholder: false,
        taken: null,
        liveCard: null,
      };
    }

    return {
      round,
      tricks: info?.tricks ?? tricksForRound(round),
      state: stateValue,
      info: {
        sumBids: info?.sumBids ?? 0,
        overUnder: info?.overUnder ?? 'match',
        showBidChip: stateValue === 'bidding' || stateValue === 'scored',
      },
      entries,
    };
  });

  return { columns, rounds };
}

export function GameDetailPageClient({ gameId }: GameDetailPageClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const confirmDialog = useConfirmDialog();
  const { ready, awaitHydration, hydrationEpoch } = useAppState();
  const [game, setGame] = React.useState<GameRecord | null | undefined>(undefined);
  const [resumePending, setResumePending] = React.useState<string | null>(null);

  const describeError = React.useCallback((error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
  }, []);

  const load = React.useCallback(() => {
    if (!gameId) {
      setGame(null);
      return;
    }
    setGame(undefined);
    let cancelled = false;
    void (async () => {
      try {
        const record = await getGame(undefined, gameId);
        if (!cancelled) setGame(record);
      } catch (error) {
        const reason = describeError(error);
        captureBrowserMessage('games.detail.load.failed', {
          level: 'warn',
          attributes: { reason, gameId },
        });
        if (!cancelled) setGame(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, describeError]);

  React.useEffect(() => {
    const dispose = load();
    return () => {
      dispose?.();
    };
  }, [load]);

  React.useEffect(() => {
    if (!gameId) return;
    return subscribeToGamesSignal((signal) => {
      if (signal.gameId !== gameId) return;
      if (signal.type === 'deleted') {
        setGame(null);
      }
    });
  }, [gameId]);

  React.useEffect(() => {
    if (!gameId) return;
    if (!game) return;
    trackGameDetailView({ gameId, source: 'games.detail.page' });
  }, [gameId, game]);

  const stats = React.useMemo(() => (game ? analyzeGame(game) : null), [game]);
  const isCompleted = React.useMemo(() => (game ? isGameRecordCompleted(game) : false), [game]);
  const isArchived = React.useMemo(() => (game ? game.archived : false), [game]);
  const reconstructedState = React.useMemo(() => {
    if (!game) return null;
    let next = INITIAL_STATE;
    for (const event of game.bundle.events) {
      next = reduce(next, event);
    }
    return next;
  }, [game]);

  const scorecardGrid = React.useMemo(() => {
    if (!game || !reconstructedState) return null;
    const playerLimit =
      typeof game.summary.players === 'number' && Number.isFinite(game.summary.players)
        ? Math.floor(Math.max(0, game.summary.players))
        : null;
    return buildReadOnlyScorecardGrid(reconstructedState, game.summary.mode ?? 'scorecard', {
      playerLimit,
      slotMapping: game.summary.slotMapping ?? null,
    });
  }, [game, reconstructedState]);

  const scoresEntries = React.useMemo(
    () => (game ? Object.entries(game.summary.scores) : []),
    [game],
  );

  const playersById = game?.summary.playersById ?? {};

  const handleArchiveGame = React.useCallback(async () => {
    if (!game) return;

    const gameTitle = game.title || 'Untitled Game';

    const confirmed = await confirmDialog({
      title: 'Archive game',
      description: `Archive ${gameTitle}? It will be removed from the active games list but can be restored later.`,
      confirmLabel: 'Archive game',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await deleteGame(undefined, game.id);
      toast({
        title: 'Game archived',
        description: `${gameTitle} has been archived.`,
      });
      // Navigate to games list after a short delay
      setTimeout(() => {
        router.push('/games');
      }, 1000);
    } catch (error) {
      captureBrowserException(
        error instanceof Error ? error : new Error('Failed to archive game'),
        {
          scope: 'game-detail',
          action: 'archive-game',
          gameId,
        },
      );
      toast({
        title: 'Failed to archive game',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  }, [game, gameId, confirmDialog, toast, router]);

  // Game title editing handler
  const handleSaveGameTitle = React.useCallback(
    async (newTitle: string) => {
      if (!game) {
        throw new Error('Game not found');
      }

      try {
        await updateGameTitle(undefined, game.id, newTitle);

        // Update local state to reflect the change immediately
        setGame(prev => prev ? { ...prev, title: newTitle.trim() } : null);

        toast({
          title: 'Game title updated',
          description: 'The game title has been successfully changed.',
          variant: 'success',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update game title';
        captureBrowserException(
          error instanceof Error ? error : new Error(message),
          {
            scope: 'game-detail',
            action: 'update-title',
            gameId: game.id,
          },
        );
        toast({
          title: 'Failed to update game title',
          description: message,
          variant: 'destructive',
        });
        throw error;
      }
    },
    [game, toast],
  );

  // Game resume handler
  const handleResumeGame = React.useCallback(
    async () => {
      if (!game || resumePending) return;

      // Don't allow resuming completed games
      if (isCompleted) {
        toast({
          title: 'Cannot resume completed game',
          description: 'This game has been completed and cannot be resumed.',
          variant: 'warning',
        });
        return;
      }

      setResumePending(game.id);
      try {
        const previousEpoch = hydrationEpoch;
        await restoreGame(undefined, game.id);

        const mode = deriveGameMode(game);

        // Wait for hydration or timeout
        await Promise.race([
          awaitHydration(previousEpoch),
          new Promise((resolve) => setTimeout(resolve, 750)),
        ]);

        // Navigate to the appropriate route based on game mode
        const route = mode === 'single-player'
          ? resolveSinglePlayerRoute(null, { fallback: 'entry' })
          : resolveScorecardRoute(null);

        router.push(route);

        toast({
          title: 'Game resumed',
          description: `Resumed ${mode === 'single-player' ? 'single player' : 'scorecard'} game.`,
          variant: 'success',
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        captureBrowserMessage('games.detail.resume.failed', {
          level: 'warn',
          attributes: { reason, gameId: game.id },
        });

        toast({
          title: 'Failed to resume game',
          description: 'Please try again.',
          variant: 'destructive',
        });
      } finally {
        setResumePending(null);
      }
    },
    [game, resumePending, isCompleted, toast, hydrationEpoch, restoreGame, deriveGameMode, awaitHydration, router],
  );

  const sp = game?.summary.sp;
  const summaryHeading =
    game?.summary.mode === 'single-player' ? 'Single Player Summary' : 'Game Summary';

  if (!gameId) {
    return <ArchivedGameMissing />;
  }

  if (game === undefined) {
    return (
      <div className={styles.page}>
        <div className={styles.feedback} role="status" aria-live="polite">
          <Loader2 className={styles.spinner} aria-hidden="true" />
          Loading game…
        </div>
      </div>
    );
  }

  if (!game) {
    return <ArchivedGameMissing />;
  }

  return (
    <div className={styles.container}>
      <Card className={styles.gameDetailsSection}>
        <div className={styles.gameDetailsHeader}>
          <h2 className={styles.gameDetailsTitle}>Game Details</h2>
          <p className={styles.gameDetailsDescription}>
            View and manage game information and configuration.
          </p>
        </div>
        <dl className={styles.gameDetailsList}>
          <div className={styles.gameDetailsItem}>
            <dt className={styles.gameDetailsTerm}>Game Title</dt>
            <dd className={styles.gameDetailsDescription}>
              <InlineEdit
                value={game.title || 'Untitled'}
                onSave={handleSaveGameTitle}
                placeholder="Game title"
                disabled={game === undefined}
                fontWeight={600}
                validate={(value) => {
                  if (!value.trim()) return 'Game title is required';
                  return null;
                }}
                saveLabel="Save"
                cancelLabel="Cancel"
                errorLabel="Failed to update game title"
              />
            </dd>
          </div>
          <div className={styles.gameDetailsItem}>
            <dt className={styles.gameDetailsTerm}>Game ID</dt>
            <dd className={styles.gameDetailsDescription}>{game.id}</dd>
          </div>
          <div className={styles.gameDetailsItem}>
            <dt className={styles.gameDetailsTerm}>Game Mode</dt>
            <dd className={styles.gameDetailsDescription}>
              <span className={styles.badge}>
                {game.summary.mode === 'single' ? 'Single Player' : 'Scorecard'}
              </span>
            </dd>
          </div>
          <div className={styles.gameDetailsItem}>
            <dt className={styles.gameDetailsTerm}>Status</dt>
            <dd className={styles.gameDetailsDescription}>
              {isCompleted ? (
                <span className={`${styles.badge} ${styles.completedBadge}`}>Completed</span>
              ) : (
                <span className={`${styles.badge} ${styles.incompleteBadge}`}>Incomplete</span>
              )}
            </dd>
          </div>
          <div className={styles.gameDetailsItem}>
            <dt className={styles.gameDetailsTerm}>Finished At</dt>
            <dd className={styles.gameDetailsDescription}>{formatDateTime(game.finishedAt)}</dd>
          </div>
          <div className={styles.gameDetailsItem}>
            <dt className={styles.gameDetailsTerm}>Player Count</dt>
            <dd className={styles.gameDetailsDescription}>{game.summary.players} players</dd>
          </div>
          <div className={styles.gameDetailsItem}>
            <dt className={styles.gameDetailsTerm}>Winner</dt>
            <dd className={styles.gameDetailsDescription}>{game.summary.winnerName || '—'}</dd>
          </div>
        </dl>
      </Card>

      {/* Game Actions Section */}
      <Card className={styles.gameActionsSection}>
        <div className={styles.gameActionsHeader}>
          <h2 className={styles.gameActionsTitle}>Game Actions</h2>
          <p className={styles.gameActionsDescription}>
            Manage this game's status and availability.
          </p>
        </div>
        <div className={styles.gameActionsList}>
          {/* Resume Game button - only shown for incomplete games */}
          {!isArchived && !isCompleted && (
            <Button
              onClick={handleResumeGame}
              disabled={resumePending !== null || !ready}
              className={styles.actionButton}
            >
              {resumePending ? (
                <>
                  <Loader2 className={styles.spinner} aria-hidden="true" />
                  Resuming…
                </>
              ) : (
                <>
                  <Play aria-hidden="true" /> Resume Game
                </>
              )}
            </Button>
          )}
          {!isArchived ? (
            <Button
              variant="destructive"
              onClick={handleArchiveGame}
              className={styles.actionButton}
            >
              <Archive aria-hidden="true" /> Archive Game
            </Button>
          ) : (
            <Button
              onClick={() => router.push(resolveGameModalRoute(gameId, 'restore'))}
              className={styles.actionButton}
            >
              Restore Game
            </Button>
          )}
        </div>
      </Card>

      {scorecardGrid ? (
        <Card className={styles.scorecardSection}>
          <div className={styles.scorecardHeader}>
            <h2 className={styles.scorecardTitle}>Scorecard</h2>
            <p className={styles.scorecardDescription}>
              View the complete game scorecard with bids, tricks, and cumulative scores.
            </p>
          </div>
          <div className={styles.scorecardContent}>
            <ScorecardGrid
              columns={scorecardGrid.columns}
              rounds={scorecardGrid.rounds}
              disableInputs
              disableRoundStateCycling
            />
          </div>
        </Card>
      ) : null}

      <Card className={styles.summarySection}>
        <div className={styles.summaryHeader}>
          <h2 className={styles.summaryTitle}>{summaryHeading}</h2>
          <p className={styles.summaryDescription}>
            Review game results, player performance, and detailed statistics.
          </p>
        </div>
        <div className={styles.summaryContent}>
          <Card className={styles.finalScoresSection}>
            <div className={styles.finalScoresHeader}>
              <h3 className={styles.finalScoresTitle}>Final Scores</h3>
            </div>
            {scoresEntries.length === 0 ? (
              <div className={styles.emptyText}>No players</div>
            ) : (
              <div className={styles.scoresGrid}>
                <div className={clsx(styles.scoresHeader, styles.alignStart)}>Player</div>
                <div className={clsx(styles.scoresHeader, styles.alignEnd)}>Score</div>
                {scoresEntries
                  .sort((a, b) => b[1] - a[1])
                  .map(([pid, score]) => (
                    <React.Fragment key={pid}>
                      <div className={styles.scoreLabel}>{playersById[pid] ?? pid}</div>
                      <div className={clsx(styles.scoreValue, styles.alignEnd)}>{score}</div>
                    </React.Fragment>
                  ))}
              </div>
            )}
          </Card>

          {sp && (
            <Card className={styles.snapshotSection}>
              <div className={styles.snapshotHeader}>
                <h3 className={styles.snapshotTitle}>Single-Player Snapshot</h3>
                <p className={styles.snapshotDescription}>
                  Game state when it was archived or completed.
                </p>
              </div>
              <div className={styles.snapshotContent}>
                <div className={styles.snapshotGrid}>
                  <div className={styles.snapshotLabel}>Phase</div>
                  <div className={styles.snapshotValue}>{sp.phase}</div>
                  <div className={styles.snapshotLabel}>Round</div>
                  <div className={styles.snapshotValue}>{sp.roundNo ?? '—'}</div>
                  <div className={styles.snapshotLabel}>Dealer</div>
                  <div className={styles.snapshotValue}>
                    {playersById[sp.dealerId ?? ''] ?? sp.dealerId ?? '—'}
                  </div>
                  <div className={styles.snapshotLabel}>Leader</div>
                  <div className={styles.snapshotValue}>
                    {playersById[sp.leaderId ?? ''] ?? sp.leaderId ?? '—'}
                  </div>
                  <div className={styles.snapshotLabel}>Trump</div>
                  <div className={styles.snapshotValue}>
                    {sp.trump && sp.trumpCard ? `${sp.trumpCard.rank} of ${sp.trump}` : '—'}
                  </div>
                  <div className={styles.snapshotLabel}>Trump Broken</div>
                  <div className={styles.snapshotValue}>{sp.trumpBroken ? 'yes' : 'no'}</div>
                </div>
              </div>
            </Card>
          )}

          <Card className={styles.metaCard}>
            <div className={styles.metaSummary}>
              Events: {game.bundle.events.length} • Seq: {game.lastSeq}
            </div>
          </Card>

          <Card className={styles.statisticsSection}>
            <div className={styles.statisticsHeader}>
              <h3 className={styles.statisticsTitle}>Statistics</h3>
              <p className={styles.statisticsDescription}>
                Detailed game statistics and player performance metrics.
              </p>
            </div>
            <div className={styles.statisticsContent}>
              <div className={styles.statsColumns}>
                <div>
                  <div className={styles.subHeading}>Leaders</div>
                  <div className={styles.statsList}>
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>Most Total Bid:</span>
                      <span className={styles.statValue}>
                        {stats?.leaders.mostTotalBid
                          ? `${stats.leaders.mostTotalBid.name} (${stats.leaders.mostTotalBid.totalBid})`
                          : '—'}
                      </span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>Least Total Bid:</span>
                      <span className={styles.statValue}>
                        {stats?.leaders.leastTotalBid
                          ? `${stats.leaders.leastTotalBid.name} (${stats.leaders.leastTotalBid.totalBid})`
                          : '—'}
                      </span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>Highest Single Bid:</span>
                      <span className={styles.statValue}>
                        {stats?.leaders.highestSingleBid
                          ? `${stats.leaders.highestSingleBid.name} (R${stats.leaders.highestSingleBid.round}: ${stats.leaders.highestSingleBid.bid})`
                          : '—'}
                      </span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>Largest Loss:</span>
                      <span className={styles.statValue}>
                        {stats?.leaders.biggestSingleLoss
                          ? `${stats.leaders.biggestSingleLoss.name} (R${stats.leaders.biggestSingleLoss.round}: -${stats.leaders.biggestSingleLoss.loss})`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className={styles.subHeading}>Totals</div>
                  <div className={styles.statsList}>
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>Points bid:</span>
                      <span className={styles.statValue}>
                        {stats ? stats.totals.totalPointsBid : '—'}
                      </span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>Hands won:</span>
                      <span className={styles.statValue}>
                        {stats ? stats.totals.totalHandsWon : '—'}
                      </span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>Hands lost:</span>
                      <span className={styles.statValue}>
                        {stats ? stats.totals.totalHandsLost : '—'}
                      </span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>Elapsed time:</span>
                      <span className={styles.statValue}>
                        {stats ? formatDuration(stats.timing.durationMs) : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className={styles.roundsSection}>
            <div className={styles.roundsHeader}>
              <h3 className={styles.roundsTitle}>Rounds</h3>
              <p className={styles.roundsDescription}>
                Round-by-round breakdown of bids, tricks, and outcomes.
              </p>
            </div>
            <div className={styles.roundsContent}>
              {stats?.rounds?.length ? (
                <div className={styles.roundsGrid}>
                  <div className={clsx(styles.roundsHeader, styles.alignStart)}>Round</div>
                  <div className={clsx(styles.roundsHeader, styles.alignStart)}>Bids vs tricks</div>
                  <div className={clsx(styles.roundsHeader, styles.alignStart)}>Outcome</div>
                  {stats.rounds.map((round) => (
                    <React.Fragment key={`round-${round.round}`}>
                      <div className={styles.roundCell}>R{round.round}</div>
                      <div className={styles.roundCell}>
                        {round.sumBids} / {round.tricks}
                      </div>
                      <div className={styles.roundCell}>
                        <span
                          className={clsx(
                            styles.roundBadge,
                            round.overUnder === 'over'
                              ? styles.roundBadgeOver
                              : round.overUnder === 'under'
                                ? styles.roundBadgeUnder
                                : styles.roundBadgeExact,
                          )}
                        >
                          {round.overUnder}
                        </span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyText}>No round data recorded for this game.</div>
              )}
            </div>
          </Card>

          <Card className={styles.timingSection}>
            <div className={styles.timingHeader}>
              <h3 className={styles.timingTitle}>Game Timing</h3>
              <p className={styles.timingDescription}>
                Start time, duration, and completion details for this game.
              </p>
            </div>
            <div className={styles.timingContent}>
              <div className={styles.timingGrid}>
                <div className={styles.timingGroup}>
                  <span className={styles.timingLabel}>Started</span>
                  <span className={styles.timingValue}>
                    {stats ? formatDateTime(stats.timing.startedAt) : '—'}
                  </span>
                </div>
                <div className={styles.timingGroup}>
                  <span className={styles.timingLabel}>Finished</span>
                  <span className={styles.timingValue}>
                    {stats ? formatDateTime(stats.timing.finishedAt) : '—'}
                  </span>
                </div>
                <div className={styles.timingGroup}>
                  <span className={styles.timingLabel}>Duration</span>
                  <span className={styles.timingValue}>
                    {stats ? formatDuration(stats.timing.durationMs) : '—'}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </Card>
    </div>
  );
}

export default GameDetailPageClient;
