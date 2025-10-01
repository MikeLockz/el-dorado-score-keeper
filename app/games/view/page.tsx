'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { Button, Card } from '@/components/ui';
import { type GameRecord, getGame, restoreGame } from '@/lib/state';
import { analyzeGame } from '@/lib/analytics';
import { formatDuration } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { captureBrowserMessage } from '@/lib/observability/browser';

import styles from './page.module.scss';

function GameDetailPageInner() {
  const search = useSearchParams();
  const id = search.get('id') || '';
  const [game, setGame] = React.useState<GameRecord | null | undefined>(undefined);
  const router = useRouter();

  React.useEffect(() => {
    let on = true;
    void (async () => {
      try {
        const rec = id ? await getGame(undefined, id) : null;
        if (on) setGame(rec);
      } catch (e) {
        const reason = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
        captureBrowserMessage('games.detail.load.failed', {
          level: 'warn',
          attributes: {
            reason,
            gameId: id,
          },
        });
        if (on) setGame(null);
      }
    })();
    return () => {
      on = false;
    };
  }, [id]);

  const onRestore = async () => {
    if (!game) return;
    if (!confirm('Restore this game as current? Current progress will be replaced.')) return;
    await restoreGame(undefined, game.id);
    router.replace('/');
  };

  const stats = React.useMemo(() => (game ? analyzeGame(game) : null), [game]);

  if (!id) {
    return <div className={styles.feedback}>Missing id.</div>;
  }
  if (game === undefined) {
    return <div className={styles.feedback}>Loading…</div>;
  }
  if (!game) {
    return <div className={styles.feedback}>Game not found.</div>;
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
        <Button onClick={() => void onRestore()}>Restore</Button>
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
                <span className={styles.statLabel}>Biggest Single Loss:</span>
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
                <span className={styles.statLabel}>Total Points Bid:</span>
                <span className={styles.statValue}>{stats?.totals.totalPointsBid ?? '—'}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Hands Won:</span>
                <span className={styles.statValue}>{stats?.totals.totalHandsWon ?? '—'}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Hands Lost:</span>
                <span className={styles.statValue}>{stats?.totals.totalHandsLost ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.roundsSection}>
          <div className={styles.subHeading}>Rounds</div>
          <div className={styles.roundsGrid}>
            <div className={clsx(styles.roundsHeader, styles.alignEnd)}>Round</div>
            <div className={clsx(styles.roundsHeader, styles.alignEnd)}>Sum Bids</div>
            <div className={styles.roundsHeader}>Status</div>
            {(stats?.rounds ?? [])
              .slice()
              .sort((a, b) => b.tricks - a.tricks)
              .map((r) => {
                const badgeVariant =
                  r.overUnder === 'over'
                    ? styles.roundBadgeOver
                    : r.overUnder === 'under'
                      ? styles.roundBadgeUnder
                      : styles.roundBadgeExact;
                return (
                  <React.Fragment key={r.round}>
                    <div className={clsx(styles.roundCell, styles.alignEnd)}>{r.tricks}</div>
                    <div className={clsx(styles.roundCell, styles.alignEnd)}>{r.sumBids}</div>
                    <div className={styles.roundCell}>
                      <span className={clsx(styles.roundBadge, badgeVariant)}>{r.overUnder}</span>
                    </div>
                  </React.Fragment>
                );
              })}
          </div>
        </div>

        <div className={styles.timingGrid}>
          <div className={styles.timingGroup}>
            <div className={styles.statLabel}>Started</div>
            <div className={styles.timingValue}>
              {stats ? formatDateTime(stats.timing.startedAt) : '—'}
            </div>
          </div>
          <div className={styles.timingGroup}>
            <div className={styles.statLabel}>Ended</div>
            <div className={styles.timingValue}>
              {stats ? formatDateTime(stats.timing.finishedAt) : '—'}
            </div>
          </div>
          <div className={styles.timingGroup}>
            <div className={styles.statLabel}>Duration</div>
            <div className={styles.timingValue}>
              {stats ? formatDuration(stats.timing.durationMs) : '—'}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function GameDetailPage() {
  return (
    <React.Suspense fallback={<div className={styles.feedback}>Loading…</div>}>
      <GameDetailPageInner />
    </React.Suspense>
  );
}
