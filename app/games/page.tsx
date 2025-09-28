'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import clsx from 'clsx';
import { Button, Card, Skeleton } from '@/components/ui';
import { Loader2, MoreHorizontal } from 'lucide-react';
import { type GameRecord, listGames, deleteGame, restoreGame } from '@/lib/state';
import { formatDateTime } from '@/lib/format';
import {
  useNewGameRequest,
  hasScorecardProgress,
  hasSinglePlayerProgress,
} from '@/lib/game-flow';
import { useAppState } from '@/components/state-provider';

import styles from './page.module.scss';

type PendingAction = {
  type: 'restore' | 'delete';
  game: GameRecord;
};

const skeletonRows = Array.from({ length: 4 });

export default function GamesPage() {
  const [games, setGames] = React.useState<GameRecord[] | null>(null);
  const router = useRouter();
  const { state } = useAppState();
  const resumeRoute = React.useMemo(() => {
    if (hasSinglePlayerProgress(state)) return '/single-player';
    if (hasScorecardProgress(state)) return '/scorecard';
    return null;
  }, [state]);
  const resumeRouteRef = React.useRef<string | null>(resumeRoute);
  resumeRouteRef.current = resumeRoute;
  const handleResumeCurrentGame = React.useCallback(() => {
    const target = resumeRouteRef.current;
    if (!target) return;
    router.push(target);
  }, [router]);
  const { startNewGame, pending: startPending } = useNewGameRequest({
    onSuccess: () => {
      router.push('/');
    },
    onCancelled: handleResumeCurrentGame,
  });

  const load = React.useCallback(async () => {
    try {
      const list = await listGames();
      setGames(list);
    } catch (error) {
      console.warn('Failed to load games', error);
      setGames([]);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const [menuOpen, setMenuOpen] = React.useState<null | {
    id: string;
    x: number;
    y: number;
    openUp?: boolean;
  }>(null);
  const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null);
  const [optimisticState, setOptimisticState] = React.useState<
    Record<string, 'restoring' | 'deleting'>
  >({});
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 4500);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const onNewGame = async () => {
    resumeRouteRef.current = resumeRoute;
    await startNewGame();
  };

  const requestAction = React.useCallback(
    (game: GameRecord, type: PendingAction['type']) => {
      if (optimisticState[game.id]) return;
      setMenuOpen(null);
      setPendingAction({ game, type });
    },
    [optimisticState],
  );

  const confirmAction = React.useCallback(async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    setOptimisticState((prev) => ({
      ...prev,
      [action.game.id]: action.type === 'restore' ? 'restoring' : 'deleting',
    }));
    const title = action.game.title || 'Untitled';
    setStatusMessage(`${action.type === 'restore' ? 'Restoring' : 'Deleting'} "${title}"…`);

    try {
      if (action.type === 'restore') {
        await restoreGame(undefined, action.game.id);
        setStatusMessage(`Restored "${title}". Redirecting to current game.`);
        router.push('/');
      } else {
        await deleteGame(undefined, action.game.id);
        setStatusMessage(`Deleted "${title}".`);
        await load();
      }
    } catch (error) {
      console.error(`Failed to ${action.type} game`, error);
      setStatusMessage(
        `Unable to ${action.type === 'restore' ? 'restore' : 'delete'} "${title}". Please try again.`,
      );
      await load();
    } finally {
      setOptimisticState((prev) => {
        const next = { ...prev };
        delete next[action.game.id];
        return next;
      });
    }
  }, [pendingAction, load, router]);

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
        <div aria-live="polite" aria-atomic="true" className={styles.statusLive}>
          {statusMessage ?? ''}
        </div>
        {statusMessage ? <div className={styles.statusMessage}>{statusMessage}</div> : null}
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
                  games.map((g) => {
                    const optimistic = optimisticState[g.id];
                    const disableActions = Boolean(optimistic);
                    return (
                      <tr
                        key={g.id}
                        className={clsx(styles.row, disableActions && styles.rowDisabled)}
                        onClick={() => {
                          if (disableActions) return;
                          router.push(`/games/view?id=${g.id}`);
                        }}
                      >
                        <td className={styles.cell}>
                          <div className={styles.titleGroup}>
                            <div className={styles.titleText}>{g.title || 'Untitled'}</div>
                            <div className={styles.titleMeta}>{formatDateTime(g.finishedAt)}</div>
                          </div>
                        </td>
                        <td className={clsx(styles.cell, styles.cellCenter)}>
                          {g.summary.players}
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
                                variant="outline"
                                onClick={() => requestAction(g, 'restore')}
                                disabled={disableActions}
                              >
                                Restore
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => requestAction(g, 'delete')}
                                disabled={disableActions}
                              >
                                Delete
                              </Button>
                            </div>
                            <div className={styles.mobileActions}>
                              <Button
                                size="icon"
                                variant="outline"
                                aria-label="Actions"
                                disabled={disableActions}
                                onClick={(event) => {
                                  if (disableActions) return;
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
                          {optimistic ? (
                            <p
                              className={clsx(
                                styles.optimisticMessage,
                                optimistic === 'restoring'
                                  ? styles.optimisticMessageRestore
                                  : styles.optimisticMessageDelete,
                              )}
                            >
                              {optimistic === 'restoring' ? 'Restoring…' : 'Deleting…'}
                            </p>
                          ) : null}
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
                <button
                  className={styles.menuItem}
                  onClick={() => {
                    const game = games?.find((item) => item.id === menuOpen.id);
                    if (game) {
                      requestAction(game, 'restore');
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
                      requestAction(game, 'delete');
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
      <AlertDialog.Root
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null);
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles.dialogOverlay} />
          <AlertDialog.Content className={styles.dialogContent}>
            <AlertDialog.Title className={styles.dialogTitle}>
              {pendingAction?.type === 'restore' ? 'Restore this game?' : 'Delete this game?'}
            </AlertDialog.Title>
            <AlertDialog.Description className={styles.dialogDescription}>
              {pendingAction?.type === 'restore'
                ? 'Restoring will replace your current progress with the archived session.'
                : 'Deleting removes the archived game permanently. This action cannot be undone.'}
            </AlertDialog.Description>
            <div className={styles.dialogActions}>
              <AlertDialog.Cancel asChild>
                <Button variant="outline">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant={pendingAction?.type === 'delete' ? 'destructive' : 'default'}
                  onClick={() => {
                    void confirmAction();
                  }}
                >
                  {pendingAction?.type === 'delete' ? 'Delete' : 'Restore'}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
