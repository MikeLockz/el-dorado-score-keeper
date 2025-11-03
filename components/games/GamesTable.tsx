'use client';

import React from 'react';
import clsx from 'clsx';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';

import { Button, Card, DataTable, Skeleton, useToast } from '@/components/ui';
import { useRouter } from 'next/navigation';
import { formatDateTime } from '@/lib/format';
import {
  type GameRecord,
  deriveGameMode,
  isGameRecordCompleted,
  resolveGamePlayerCount,
  resolveArchivedGameRoute,
  resolveGameModalRoute,
} from '@/lib/state';
import { captureBrowserException } from '@/lib/observability/browser';
import { Loader2, MoreHorizontal } from 'lucide-react';

import styles from './GamesTable.module.scss';

const skeletonRows = Array.from({ length: 4 });

type Game = GameRecord;

const describeError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
};

const reportGameError = (action: string, error: Error) => {
  const reason = error.message || describeError(error);
  captureBrowserException(error, {
    scope: 'games-table',
    action,
    reason,
  });
};

const runWithGameError = async (action: string, op: () => Promise<void>, toastContext: any) => {
  try {
    await op();
    return true;
  } catch (error: unknown) {
    const normalized = error instanceof Error ? error : new Error(describeError(error));
    reportGameError(action, normalized);
    toastContext({
      title: 'Action failed',
      description: normalized.message || 'Please try again.',
      variant: 'destructive',
    });
    return false;
  }
};

function describeGameMode(game: GameRecord): string {
  const mode = deriveGameMode(game);
  return mode === 'single-player' ? 'Single Player' : 'Scorecard';
}

type GamesTableProps = {
  games?: Game[];
  loading?: boolean;
  onGamesChange?: () => void;
};

export function GamesTable({
  games: externalGames,
  loading = false,
  onGamesChange,
}: GamesTableProps = {}) {
  const router = useRouter();
  const { toast } = useToast();
  const games = externalGames || [];

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

  const menuGameCompleted = menuGame ? isGameRecordCompleted(menuGame) : false;

  const handleGameClick = React.useCallback(
    (game: Game) => {
      router.push(resolveArchivedGameRoute(game.id));
    },
    [router],
  );

  const handleDeleteGame = React.useCallback(
    async (gameId: string) => {
      const ok = await runWithGameError(
        'delete-game',
        async () => {
          router.push(resolveGameModalRoute(gameId, 'delete'));
        },
        toast,
      );
      if (ok) {
        onGamesChange?.();
      }
    },
    [router, onGamesChange, toast],
  );

  const handleRestoreGame = React.useCallback(
    async (gameId: string) => {
      const ok = await runWithGameError(
        'restore-game',
        async () => {
          router.push(resolveGameModalRoute(gameId, 'restore'));
        },
        toast,
      );
      if (ok) {
        onGamesChange?.();
      }
    },
    [router, onGamesChange, toast],
  );

  const columnHelper = createColumnHelper<Game>();

  const columns: ColumnDef<Game>[] = [
    columnHelper.accessor('title', {
      header: ({ column }) => (
        <button
          className="sortableHeader"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Title
          <span className="sortIcon">
            {column.getIsSorted() === 'asc' ? ' ↑' : column.getIsSorted() === 'desc' ? ' ↓' : ''}
          </span>
        </button>
      ),
      cell: ({ row }) => {
        const game = row.original;
        return (
          <div className={styles.titleGroup}>
            <div className={styles.titleText}>{game.title || 'Untitled'}</div>
            <div className={styles.titleMeta}>{formatDateTime(game.finishedAt)}</div>
          </div>
        );
      },
    }),
    columnHelper.accessor('summary.mode', {
      header: ({ column }) => (
        <button
          className="sortableHeader"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Type
          <span className="sortIcon">
            {column.getIsSorted() === 'asc' ? ' ↑' : column.getIsSorted() === 'desc' ? ' ↓' : ''}
          </span>
        </button>
      ),
      cell: ({ row }) => {
        const game = row.original;
        const mode = describeGameMode(game);
        return (
          <span
            className={clsx(
              'typeBadge',
              mode === 'Single Player' ? 'singleBadge' : 'scorecardBadge',
            )}
          >
            {mode}
          </span>
        );
      },
    }),
    columnHelper.accessor(
    (game) => resolveGamePlayerCount(game),
    {
      id: 'playerCount',
      header: ({ column }) => (
        <button
          className="sortableHeader"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Players
          <span className="sortIcon">
            {column.getIsSorted() === 'asc' ? ' ↑' : column.getIsSorted() === 'desc' ? ' ↓' : ''}
          </span>
        </button>
      ),
      cell: ({ row }) => {
        const game = row.original;
        const playerCount = resolveGamePlayerCount(game);
        return (
          <span className="secondaryText">
            {playerCount} {playerCount === 1 ? 'player' : 'players'}
          </span>
        );
      },
    },
  ),
    columnHelper.accessor(
    (game) => {
      const isCompleted = isGameRecordCompleted(game);
      return isCompleted ? (game.summary.winnerName ?? '-') : 'incomplete';
    },
    {
      id: 'winner',
      header: ({ column }) => (
        <button
          className="sortableHeader"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Winner
          <span className="sortIcon">
            {column.getIsSorted() === 'asc' ? ' ↑' : column.getIsSorted() === 'desc' ? ' ↓' : ''}
          </span>
        </button>
      ),
      cell: ({ row }) => {
        const game = row.original;
        const isCompleted = isGameRecordCompleted(game);
        return (
          <span className={clsx('secondaryText', styles.cellEmphasis)}>
            {isCompleted ? (game.summary.winnerName ?? '-') : 'incomplete'}
          </span>
        );
      },
    },
  ),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const game = row.original;
        const isCompleted = isGameRecordCompleted(game);

        return (
          <div className={styles.actionCluster}>
            <div className={styles.desktopActions}>
              {!isCompleted ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRestoreGame(game.id);
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
                  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                  const spaceBelow = window.innerHeight - rect.bottom;
                  const openUp = spaceBelow < 140;
                  setMenuOpen((current) =>
                    current && current.id === game.id
                      ? null
                      : {
                          id: game.id,
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
        );
      },
    }),
  ];

  if (loading) {
    return (
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
              {skeletonRows.map((_, idx) => (
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
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  return (
    <>
      <DataTable
        data={games}
        columns={columns}
        onRowClick={handleGameClick}
        emptyMessage="No archived games found."
        defaultSorting={[{ id: 'title', desc: false }]}
      />
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
                    handleRestoreGame(menuGame.id);
                    setMenuOpen(null);
                  }
                }}
                disabled={!menuGame}
              >
                Restore
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
