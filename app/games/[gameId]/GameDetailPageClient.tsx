'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

import { Button, Card } from '@/components/ui';
import { type GameRecord, getGame, resolveArchivedGameRoute, resolveGameModalRoute } from '@/lib/state';
import { analyzeGame } from '@/lib/analytics';
import { formatDateTime } from '@/lib/format';
import { formatDuration } from '@/lib/utils';
import { captureBrowserMessage } from '@/lib/observability/browser';
import { shareLink } from '@/lib/ui/share';
import { useToast } from '@/components/ui/toast';
import ArchivedGameMissing from '../_components/ArchivedGameMissing';
import { subscribeToGamesSignal } from '@/lib/state/game-signals';
import { trackGameDetailView } from '@/lib/observability/events';

import styles from './page.module.scss';

export type GameDetailPageClientProps = {
  gameId: string;
};

export function GameDetailPageClient({ gameId }: GameDetailPageClientProps) {
  const router = useRouter();
  const [game, setGame] = React.useState<GameRecord | null | undefined>(undefined);
  const { toast } = useToast();

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
  const shareTitle = game?.title?.trim() || 'Archived game';

  const handleCopyLink = React.useCallback(async () => {
    if (!gameId) return;
    const href = resolveArchivedGameRoute(gameId);
    await shareLink({
      href,
      toast,
      title: shareTitle,
      successMessage: 'Archived game link copied',
    });
  }, [gameId, shareTitle, toast]);

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

  const scoresEntries = Object.entries(game.summary.scores);
  const playersById = game.summary.playersById;
  const sp = game.summary.sp;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{game.title || 'Game'}</h1>
          <div className={styles.headerMeta}>Finished {formatDateTime(game.finishedAt)}</div>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" onClick={() => void handleCopyLink()}>
            Copy link
          </Button>
          <Button variant="outline" onClick={() => router.push(resolveGameModalRoute(gameId, 'delete'))}>
            Delete
          </Button>
          <Button onClick={() => router.push(resolveGameModalRoute(gameId, 'restore'))}>Restore</Button>
        </div>
      </div>

      <Card className={styles.sectionCard}>
        <div className={styles.sectionHeading}>Final Scores</div>
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
        <Card className={styles.sectionCard}>
          <div className={styles.sectionHeading}>Single-Player Snapshot</div>
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
        </Card>
      )}

      <Card className={styles.metaCard}>
        <div className={styles.metaSummary}>
          Events: {game.bundle.events.length} • Seq: {game.lastSeq}
        </div>
      </Card>

      <Card className={styles.sectionCard}>
        <div className={styles.sectionHeading}>Statistics</div>
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
      </Card>

      <Card className={clsx(styles.sectionCard, styles.roundsSection)}>
        <div className={styles.sectionHeading}>Rounds</div>
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
      </Card>

      <div className={styles.timingGrid}>
        <div className={styles.timingGroup}>
          <span className={styles.statLabel}>Started</span>
          <span className={styles.timingValue}>{stats ? formatDateTime(stats.timing.startedAt) : '—'}</span>
        </div>
        <div className={styles.timingGroup}>
          <span className={styles.statLabel}>Finished</span>
          <span className={styles.timingValue}>{stats ? formatDateTime(stats.timing.finishedAt) : '—'}</span>
        </div>
        <div className={styles.timingGroup}>
          <span className={styles.statLabel}>Duration</span>
          <span className={styles.timingValue}>{stats ? formatDuration(stats.timing.durationMs) : '—'}</span>
        </div>
      </div>
    </div>
  );
}

export default GameDetailPageClient;
