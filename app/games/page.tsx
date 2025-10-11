'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Button, Card, Skeleton } from '@/components/ui';
import { Loader2, MoreHorizontal } from 'lucide-react';
import { type GameRecord, listGames } from '@/lib/state';
import { formatDateTime } from '@/lib/format';
import { useNewGameRequest, hasScorecardProgress, hasSinglePlayerProgress } from '@/lib/game-flow';
import { useAppState } from '@/components/state-provider';
import { captureBrowserMessage } from '@/lib/observability/browser';
import {
  resolveSinglePlayerRoute,
  resolveScorecardRoute,
  resolveArchivedGameRoute,
  resolveGameModalRoute,
} from '@/lib/state';
import { subscribeToGamesSignal } from '@/lib/state/game-signals';
import { trackGamesListView } from '@/lib/observability/events';

import styles from './page.module.scss';

const skeletonRows = Array.from({ length: 4 });

export default function GamesPage() {
  const [games, setGames] = React.useState<GameRecord[] | null>(null);
  const router = useRouter();
  const { state } = useAppState();
  const resumeContext = React.useMemo(() => {
    if (hasSinglePlayerProgress(state)) {
      return {
        route: resolveSinglePlayerRoute(state, { fallback: 'entry' }),
        mode: 'single-player' as const,
      };
    }
    if (hasScorecardProgress(state)) {
      return {
        route: resolveScorecardRoute(state),
        mode: 'scorecard' as const,
      };
    }
    return null;
  }, [state]);
  const resumeRoute = resumeContext?.route ?? null;
  const resumeMode = resumeContext?.mode ?? null;
  const resumeRouteRef = React.useRef<string | null>(resumeRoute);
  resumeRouteRef.current = resumeRoute;
  const handleResumeCurrentGame = React.useCallback(() => {
    const target = resumeRouteRef.current;
    if (!target) return;
    resumeRouteRef.current = null;
    router.push(target);
  }, [router]);
  const scorecardHref = React.useMemo(() => resolveScorecardRoute(state), [state]);
  const handleOpenScorecard = React.useCallback(() => {
    if (!scorecardHref) return;
    router.push(scorecardHref);
  }, [router, scorecardHref]);
  const { startNewGame, pending: startPending } = useNewGameRequest({
    onSuccess: () => {
      router.push('/');
    },
    onCancelled: handleResumeCurrentGame,
    analytics: { source: 'games' },
  });

  const describeError = React.useCallback((error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
  }, []);

  const load = React.useCallback(async () => {
    try {
      const list = await listGames();
      setGames(list);
    } catch (error: unknown) {
      captureBrowserMessage('games.load.failed', {
        level: 'warn',
        attributes: {
          reason: describeError(error),
        },
      });
      setGames([]);
    }
  }, [describeError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    trackGamesListView({ source: 'games.page' });
  }, []);

  React.useEffect(() => {
    return subscribeToGamesSignal((signal) => {
      if (signal.type === 'added' || signal.type === 'deleted') {
        void load();
      }
    });
  }, [load]);

  const [menuOpen, setMenuOpen] = React.useState<null | {
    id: string;
    x: number;
    y: number;
    openUp?: boolean;
  }>(null);

  const onNewGame = async () => {
    resumeRouteRef.current = resumeRoute;
    const inferredMode: 'single-player' | 'scorecard' = resumeMode ?? 'scorecard';
    const ok = await startNewGame({
      analytics: {
        mode: inferredMode,
        source: 'games.new-game',
      },
    });
    if (!ok) {
      handleResumeCurrentGame();
    }
  };

  return (
    <>
      <div className={styles.page}>
        <div className={styles.headerRow}>
          <h1 className={styles.title}>Games</h1>
          <Button onClick={() => void onNewGame()} disabled={startPending}>
            {startPending ? (
              <>
                <Loader2 className={styles.loaderIcon} aria-hidden="true" />
                Archiving…
              </>
            ) : (
              'New Game'
            )}
          </Button>
        </div>
        <section className={styles.scorecardSection} aria-label="Scorecard overview">
          <div className={styles.scorecardCopy}>
            <h2 className={styles.scorecardTitle}>Keep score with the digital scorecard</h2>
            <p className={styles.scorecardDescription}>
              Track bids, tricks, and totals for an in-person table. Jump into the live scorecard to
              manage the current game or start recording a new one.
            </p>
          </div>
          <Button variant="outline" onClick={handleOpenScorecard}>
            Open scorecard view
          </Button>
        </section>
        <Card className={styles.tableCard}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead className={styles.tableHead}>
                <tr>
                  <th scope="col" className={styles.headerCell}>
                    Title
                  </th>
                  <th scope="col" className={clsx(styles.headerCell, styles.headerCellCenter)}>
                    Players
                  </th>
                  <th scope="col" className={clsx(styles.headerCell, styles.headerCellCenter)}>
                    Winner
                  </th>
                  <th scope="col" className={clsx(styles.headerCell, styles.headerCellCenter)}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className={styles.tableBody}>
                {games === null ? (
                  skeletonRows.map((_, idx) => (
                    <tr key={`skeleton-${idx}`} className={styles.skeletonRow}>
                      <td className={styles.cell}>
                        <div className={styles.titleGroup}>
                          <Skeleton className={styles.skeletonTitle} />
                          <Skeleton className={styles.skeletonSubtitle} />
                        </div>
                      </td>
                      <td className={clsx(styles.cell, styles.cellCenter)}>
                        <Skeleton className={styles.skeletonPlayers} />
                      </td>
                      <td className={clsx(styles.cell, styles.cellCenter)}>
                        <Skeleton className={styles.skeletonWinner} />
                      </td>
                      <td className={clsx(styles.cell, styles.cellActions)}>
                        <Skeleton className={styles.skeletonActions} />
                      </td>
                    </tr>
                  ))
                ) : games.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.emptyCell}>
                      No archived games yet.
                    </td>
                  </tr>
                ) : (
                  games.map((g) => (
                    <tr
                      key={g.id}
                      className={styles.row}
                      onClick={() => {
                        router.push(resolveArchivedGameRoute(g.id));
                      }}
                    >
                      <td className={styles.cell}>
                        <div className={styles.titleGroup}>
                          <div className={styles.titleText}>{g.title || 'Untitled'}</div>
                          <div className={styles.titleMeta}>{formatDateTime(g.finishedAt)}</div>
                        </div>
                      </td>
                      <td className={clsx(styles.cell, styles.cellCenter)}>{g.summary.players}</td>
                      <td className={clsx(styles.cell, styles.cellCenter, styles.cellEmphasis)}>
                        {g.summary.winnerName ?? '-'}
                      </td>
                      <td className={clsx(styles.cell, styles.cellActions)}>
                        <div
                          className={styles.actionCluster}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className={styles.desktopActions}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                router.push(resolveGameModalRoute(g.id, 'restore'));
                              }}
                            >
                              Restore
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                router.push(resolveGameModalRoute(g.id, 'delete'));
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                          <div className={styles.mobileActions}>
                            <Button
                              size="icon"
                              variant="outline"
                              aria-label="Actions"
                              onClick={(event) => {
                                event.stopPropagation();
                                const rect = (
                                  event.currentTarget as HTMLElement
                                ).getBoundingClientRect();
                                const spaceBelow = window.innerHeight - rect.bottom;
                                const openUp = spaceBelow < 140;
                                setMenuOpen((current) =>
                                  current && current.id === g.id
                                    ? null
                                    : {
                                        id: g.id,
                                        x: rect.right,
                                        y: openUp ? rect.top : rect.bottom,
                                        openUp,
                                      },
                                );
                              }}
                            >
                              <MoreHorizontal className={styles.moreIcon} />
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {menuOpen ? (
            <>
              <div className={styles.menuBackdrop} onClick={() => setMenuOpen(null)} />
              <div
                className={styles.menuContent}
                style={{
                  top: menuOpen.openUp ? menuOpen.y - 8 : menuOpen.y + 8,
                  left: menuOpen.x,
                  transform: menuOpen.openUp ? 'translate(-100%, -100%)' : 'translateX(-100%)',
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className={styles.menuItem}
                  onClick={() => {
                    const game = games?.find((item) => item.id === menuOpen.id);
                    if (game) {
                      router.push(resolveGameModalRoute(game.id, 'restore'));
                      setMenuOpen(null);
                    }
                  }}
                >
                  Restore
                </button>
                <button
                  className={clsx(styles.menuItem, styles.menuItemDestructive)}
                  onClick={() => {
                    const game = games?.find((item) => item.id === menuOpen.id);
                    if (game) {
                      router.push(resolveGameModalRoute(game.id, 'delete'));
                      setMenuOpen(null);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </>
          ) : null}
        </Card>
      </div>
    </>
  );
}
