'use client';

import React from 'react';
import clsx from 'clsx';
import { Edit } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';

import { Button } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import { selectPlayersOrdered, resolvePlayerRoute, events } from '@/lib/state';
import { formatDate } from '@/lib/format';
import { captureBrowserException } from '@/lib/observability/browser';
import { useRouter } from 'next/navigation';

import styles from './players-table.module.scss';

type Player = ReturnType<typeof selectPlayersOrdered>[number] & {
  createdAt?: number | undefined;
};

const describeError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
};

const reportPlayerError = (action: string, error: Error) => {
  const reason = error.message || describeError(error);
  captureBrowserException(error, {
    scope: 'players-table',
    action,
    reason,
  });
};

const runWithPlayerError = async (action: string, op: () => Promise<void>) => {
  try {
    await op();
    return true;
  } catch (error: unknown) {
    const normalized = error instanceof Error ? error : new Error(describeError(error));
    reportPlayerError(action, normalized);
    return false;
  }
};

function ensureUniqueName(name: string, players: Player[], excludeId?: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const taken = players.some((p) => p.id !== excludeId && p.name.trim().toLowerCase() === lower);
  return taken ? null : trimmed;
}

type PlayersTableProps = {
  onPlayersChange?: () => void;
};

export function PlayersTable({ onPlayersChange }: PlayersTableProps = {}) {
  const router = useRouter();
  const { state, ready, append } = useAppState();
  const players = React.useMemo(() => {
    const orderedPlayers = selectPlayersOrdered(state);
    return orderedPlayers.map((player) => ({
      ...player,
      createdAt: state.playerDetails?.[player.id]?.createdAt,
    }));
  }, [state]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [editingPlayerId, setEditingPlayerId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState('');
  const [editError, setEditError] = React.useState<string | null>(null);

  const handlePlayerClick = React.useCallback(
    (player: Player, event?: React.MouseEvent) => {
      // If event is provided and the click is on a player name container, don't navigate
      if (
        event &&
        (event.target as HTMLElement).closest('.playerNameContainer, .mobilePlayerName')
      ) {
        return;
      }
      router.push(resolvePlayerRoute(player.id));
    },
    [router],
  );

  const handleStartEditing = React.useCallback((player: Player, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent navigation
    setEditingPlayerId(player.id);
    setEditingName(player.name);
    setEditError(null);
  }, []);

  const handleCancelEditing = React.useCallback(() => {
    setEditingPlayerId(null);
    setEditingName('');
    setEditError(null);
  }, []);

  const handleSaveName = React.useCallback(
    async (player: Player, event: React.MouseEvent) => {
      event.stopPropagation(); // Prevent navigation

      const trimmed = editingName.trim();
      if (!trimmed) {
        setEditError('Player name cannot be empty.');
        return;
      }

      if (trimmed === player.name.trim()) {
        // No change, just cancel
        handleCancelEditing();
        return;
      }

      const unique = ensureUniqueName(trimmed, players, player.id);
      if (!unique) {
        setEditError('That name is already in use.');
        return;
      }

      try {
        await runWithPlayerError('rename-player', async () => {
          await append(events.playerRenamed({ id: player.id, name: unique }));
        });
        handleCancelEditing();
        onPlayersChange?.();
      } catch (error: unknown) {
        const normalized = error instanceof Error ? error : new Error('Failed to rename player');
        reportPlayerError('rename-player', normalized);
        setEditError('Failed to rename player. Please try again.');
      }
    },
    [editingName, players, append, handleCancelEditing, onPlayersChange],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCancelEditing();
      } else if (event.key === 'Enter') {
        const player = players.find((p) => p.id === editingPlayerId);
        if (player) {
          handleSaveName(player, event as any);
        }
      }
    },
    [editingPlayerId, players, handleCancelEditing, handleSaveName],
  );

  const columnHelper = createColumnHelper<Player>();

  const columns = [
    columnHelper.accessor('name', {
      header: ({ column }) => (
        <button
          className={styles.sortableHeader}
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Player Name
          <span className={styles.sortIcon}>
            {column.getIsSorted() === 'asc' ? ' ↑' : column.getIsSorted() === 'desc' ? ' ↓' : ''}
          </span>
        </button>
      ),
      cell: ({ row }) => {
        const player = row.original;
        const isEditing = editingPlayerId === player.id;

        if (isEditing) {
          return (
            <div className={styles.inlineEditContainer}>
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                className={styles.inlineEditInput}
                placeholder="Player name"
                autoFocus
              />
              <div className={styles.inlineEditActions}>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelEditing();
                  }}
                  className={styles.inlineEditButton}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={(e) => handleSaveName(player, e)}
                  className={styles.inlineEditButton}
                >
                  Save
                </Button>
              </div>
              {editError && <div className={styles.inlineEditError}>{editError}</div>}
            </div>
          );
        }

        return (
          <div
            onClick={(e) => handleStartEditing(player, e)}
            className={styles.playerNameContainer}
          >
            <div className={styles.playerName}>{player.name}</div>
            <Edit className={styles.editIcon} aria-hidden="true" />
          </div>
        );
      },
    }),
    columnHelper.accessor('type', {
      header: 'Type',
      cell: ({ row }) => (
        <span className={clsx(styles.typeBadge, styles[row.getValue('type')])}>
          {row.getValue('type')}
        </span>
      ),
    }),
    columnHelper.accessor('createdAt', {
      header: ({ column }) => (
        <button
          className={styles.sortableHeader}
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Created
          <span className={styles.sortIcon}>
            {column.getIsSorted() === 'asc' ? ' ↑' : column.getIsSorted() === 'desc' ? ' ↓' : ''}
          </span>
        </button>
      ),
      cell: ({ row }) => formatDate(row.getValue('createdAt')),
    }),
  ];

  const table = useReactTable({
    data: players,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    onSortingChange: setSorting,
  });

  if (players.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No active players to display.</p>
      </div>
    );
  }

  return (
    <div className={styles.tableContainer}>
      {/* Desktop Table View */}
      <div className={styles.desktopView}>
        <table className={styles.playersTable}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className={styles.tableHeader}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={styles.tableRow}
                onClick={(e) => handlePlayerClick(row.original, e)}
                style={{ cursor: 'pointer' }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={styles.tableCell}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked Card View */}
      <div className={styles.mobileView}>
        {table.getRowModel().rows.map((row) => (
          <div
            key={row.id}
            className={styles.mobileCard}
            onClick={(e) => handlePlayerClick(row.original, e)}
            style={{ cursor: 'pointer' }}
          >
            {/* Player Info */}
            <div className={styles.mobilePlayerInfo}>
              {editingPlayerId === row.original.id ? (
                <div className={styles.mobileInlineEditContainer}>
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    className={styles.mobileInlineEditInput}
                    placeholder="Player name"
                    autoFocus
                  />
                  <div className={styles.mobileInlineEditActions}>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelEditing();
                      }}
                      className={styles.mobileInlineEditButton}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={(e) => handleSaveName(row.original, e)}
                      className={styles.mobileInlineEditButton}
                    >
                      Save
                    </Button>
                  </div>
                  {editError && <div className={styles.mobileInlineEditError}>{editError}</div>}
                </div>
              ) : (
                <>
                  <div
                    className={styles.mobilePlayerName}
                    onClick={(e) => handleStartEditing(row.original, e)}
                  >
                    {row.original.name}
                    <Edit className={styles.mobileEditIcon} aria-hidden="true" />
                  </div>
                  <div className={styles.mobilePlayerMeta}>
                    <span className={clsx(styles.mobileTypeBadge, styles[row.original.type])}>
                      {row.original.type}
                    </span>
                    <span className={styles.mobileCreatedDate}>
                      Created {formatDate(row.original.createdAt)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
