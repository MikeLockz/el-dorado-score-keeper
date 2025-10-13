'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Button, Card, Skeleton } from '@/components/ui';
import { Loader2, MoreHorizontal } from 'lucide-react';
import {
  type GameRecord,
  listGames,
  deriveGameMode,
  isGameRecordCompleted,
  resolveGamePlayerCount,
} from '@/lib/state';
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

function describeGameMode(game: GameRecord): string {
  const mode = deriveGameMode(game);
  return mode === 'single-player' ? 'Single Player' : 'Scorecard';
}

export default function GamesPage() {
  const [games, setGames] = React.useState<GameRecord[] | null>(null);
  const completedMap = React.useMemo<Record<string, boolean> | null>(() => {
    if (!games) return null;
    const map: Record<string, boolean> = {};
    for (const game of games) {
      map[game.id] = isGameRecordCompleted(game);
    }
    return map;
  }, [games]);
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
  const resumeRouteRef = React.useRef<string | null>(resumeRoute);
  resumeRouteRef.current = resumeRoute;
  const handleResumeCurrentGame = React.useCallback(() => {
    const target = resumeRouteRef.current;
    if (!target) return;
    resumeRouteRef.current = null;
    router.push(target);
  }, [router]);
  const handleOpenScorecard = React.useCallback(() => {
    router.push('/games/scorecards');
  }, [router]);
  const startModeRef = React.useRef<'single-player' | 'scorecard' | null>(null);
  const { startNewGame, pending: startPending } = useNewGameRequest({
    onSuccess: () => {
      const mode = startModeRef.current;
      startModeRef.current = null;
      if (mode === 'single-player') {
        router.push('/single-player/new');
      } else if (mode === 'scorecard') {
        router.push('/scorecard/new');
      } else {
        router.push('/');
      }
    },
    onCancelled: () => {
      startModeRef.current = null;
      handleResumeCurrentGame();
    },
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
      const singlePlayerGames = list.filter((game) => deriveGameMode(game) === 'single-player');
      setGames(singlePlayerGames);
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
  const menuGame = React.useMemo(() => {
    if (!menuOpen || !games) return null;
    return games.find((item) => item.id === menuOpen.id) ?? null;
  }, [menuOpen, games]);
  const menuGameCompleted = menuGame ? (completedMap?.[menuGame.id] ?? false) : false;

  const onNewGame = async () => {
    resumeRouteRef.current = resumeRoute;
    startModeRef.current = 'single-player';
    const ok = await startNewGame({
      analytics: {
        mode: 'single-player',
        source: 'games.new-game',
      },
    });
    if (!ok) {
      startModeRef.current = null;
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
            View Scorecards
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
                    Type
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
                        <Skeleton className={styles.skeletonType} />
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
                    <td colSpan={5} className={styles.emptyCell}>
                      No archived single player games yet.
                    </td>
                  </tr>
                ) : (
                  games.map((g) => {
                    const isCompleted = completedMap?.[g.id] ?? false;
                    return (
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
                        <td className={clsx(styles.cell, styles.cellCenter)}>
                          {describeGameMode(g)}
                        </td>
                        <td className={clsx(styles.cell, styles.cellCenter)}>
                          {resolveGamePlayerCount(g)}
                        </td>
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
                                variant="destructive"
                                onClick={() => {
                                  router.push(resolveGameModalRoute(g.id, 'delete'));
                                }}
                              >
                                Remove
                              </Button>
                              {!isCompleted ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    router.push(resolveGameModalRoute(g.id, 'restore'));
                                  }}
                                >
                                  Restore
                                </Button>
                              ) : null}
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
                    );
                  })
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
                {!menuGameCompleted && menuGame ? (
                  <button
                    className={styles.menuItem}
                    onClick={() => {
                      if (menuGame) {
                        router.push(resolveGameModalRoute(menuGame.id, 'restore'));
                        setMenuOpen(null);
                      }
                    }}
                    disabled={!menuGame}
                  >
                    Restore
                  </button>
                ) : null}
                <button
                  className={clsx(styles.menuItem, styles.menuItemDestructive)}
                  onClick={() => {
                    if (menuGame) {
                      router.push(resolveGameModalRoute(menuGame.id, 'delete'));
                      setMenuOpen(null);
                    }
                  }}
                  disabled={!menuGame}
                >
                  Remove
                </button>
              </div>
            </>
          ) : null}
        </Card>
      </div>
    </>
  );
}
