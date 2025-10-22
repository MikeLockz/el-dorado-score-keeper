'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

import { Button, Card } from '@/components/ui';
import ScorecardGrid, {
  type ScorecardPlayerColumn,
  type ScorecardRoundEntry,
  type ScorecardRoundView,
} from '@/components/views/scorecard/ScorecardGrid';
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
} from '@/lib/state';
import { analyzeGame } from '@/lib/analytics';
import { formatDateTime } from '@/lib/format';
import { formatDuration } from '@/lib/utils';
import { captureBrowserMessage } from '@/lib/observability/browser';
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
  const [game, setGame] = React.useState<GameRecord | null | undefined>(undefined);

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
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{game.title || 'Game'}</h1>
          <div className={styles.headerMeta}>Finished {formatDateTime(game.finishedAt)}</div>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            onClick={() => router.push(resolveGameModalRoute(gameId, 'delete'))}
          >
            Remove
          </Button>
          {!isCompleted ? (
            <Button onClick={() => router.push(resolveGameModalRoute(gameId, 'restore'))}>
              Restore
            </Button>
          ) : null}
        </div>
      </div>

      {scorecardGrid ? (
        <section className={styles.scorecardSection}>
          <h2 className={styles.scorecardHeading}>Scorecard</h2>
          <ScorecardGrid
            columns={scorecardGrid.columns}
            rounds={scorecardGrid.rounds}
            disableInputs
            disableRoundStateCycling
          />
        </section>
      ) : null}

      <section className={styles.summarySection}>
        <h2 className={styles.summaryHeading}>{summaryHeading}</h2>
        <div className={styles.summaryBody}>
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
              <span className={styles.timingValue}>
                {stats ? formatDateTime(stats.timing.startedAt) : '—'}
              </span>
            </div>
            <div className={styles.timingGroup}>
              <span className={styles.statLabel}>Finished</span>
              <span className={styles.timingValue}>
                {stats ? formatDateTime(stats.timing.finishedAt) : '—'}
              </span>
            </div>
            <div className={styles.timingGroup}>
              <span className={styles.statLabel}>Duration</span>
              <span className={styles.timingValue}>
                {stats ? formatDuration(stats.timing.durationMs) : '—'}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default GameDetailPageClient;
