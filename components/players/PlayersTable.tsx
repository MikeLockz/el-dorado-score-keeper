'use client';

import React from 'react';
import clsx from 'clsx';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';

import { Button, EditableCell, useToast, DataTable, Skeleton, Card } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import {
  selectPlayersOrdered,
  selectArchivedPlayers,
  resolvePlayerRoute,
  events,
} from '@/lib/state';
import { formatDate } from '@/lib/format';
import { captureBrowserException } from '@/lib/observability/browser';
import { useRouter } from 'next/navigation';

type Player = ReturnType<typeof selectPlayersOrdered>[number] & {
  createdAt?: number | undefined;
};

type ArchivedPlayer = ReturnType<typeof selectArchivedPlayers>[number] & {
  createdAt?: number | undefined;
};

const skeletonRows = Array.from({ length: 4 });

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
  players?: Player[] | ArchivedPlayer[];
  showArchived?: boolean;
  loading?: boolean;
};

export function PlayersTable({
  onPlayersChange,
  players: externalPlayers,
  showArchived = false,
  loading = false,
}: PlayersTableProps = {}) {
  const router = useRouter();
  const { state, ready, append } = useAppState();
  const { toast } = useToast();
  const players = React.useMemo(() => {
    if (externalPlayers) {
      return externalPlayers.map((player) => ({
        ...player,
        createdAt: state.playerDetails?.[player.id]?.createdAt || player.createdAt,
        archived: showArchived ? true : player.archived,
      }));
    }

    const orderedPlayers = selectPlayersOrdered(state);
    return orderedPlayers.map((player) => ({
      ...player,
      createdAt: state.playerDetails?.[player.id]?.createdAt,
    }));
  }, [state, externalPlayers, showArchived]);

  const handlePlayerClick = React.useCallback(
    (player: Player, event?: React.MouseEvent) => {
      // If event is provided and the click is on an editable cell, don't navigate
      if (event && (event.target as HTMLElement).closest('.editContainer, .inlineEditContainer')) {
        return;
      }
      router.push(resolvePlayerRoute(player.id));
    },
    [router],
  );

  const handleSavePlayerName = React.useCallback(
    async (playerId: string, newName: string) => {
      const ok = await runWithPlayerError('rename-player', async () => {
        await append(events.playerRenamed({ id: playerId, name: newName }));
      });
      if (ok) {
        onPlayersChange?.();
      }
      return ok;
    },
    [append, onPlayersChange],
  );

  const handleChangePlayerType = React.useCallback(
    async (playerId: string, newType: 'human' | 'bot') => {
      try {
        await append(events.playerTypeSet({ id: playerId, type: newType }));
        toast({
          title: 'Player type updated',
          description: `Type changed to ${newType === 'bot' ? 'Bot' : 'Human'}`,
        });
        onPlayersChange?.();
      } catch (error: unknown) {
        const normalized =
          error instanceof Error ? error : new Error('Failed to update player type');
        reportPlayerError('change-player-type', normalized);
        toast({
          title: 'Failed to update type',
          description: 'Please try again.',
          variant: 'destructive',
        });
      }
    },
    [append, toast, onPlayersChange],
  );

  const columnHelper = createColumnHelper<Player>();

  const columns: ColumnDef<Player>[] = [
    columnHelper.accessor('name', {
      header: ({ column }) => (
        <button
          className="sortableHeader"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Player Name
          <span className="sortIcon">
            {column.getIsSorted() === 'asc' ? ' ↑' : column.getIsSorted() === 'desc' ? ' ↓' : ''}
          </span>
        </button>
      ),
      cell: ({ row }) => {
        const player = row.original;
        return (
          <EditableCell
            value={player.name}
            onSave={(newName) => handleSavePlayerName(player.id, newName)}
            placeholder="Player name"
            validate={(value) => {
              const trimmed = value.trim();
              if (!trimmed) return 'Player name cannot be empty';
              const unique = ensureUniqueName(trimmed, players, player.id);
              if (!unique) return 'That name is already in use';
              return null;
            }}
            saveLabel="Save"
            cancelLabel="Cancel"
            errorLabel="Failed to save player name"
            showEditIcon={true}
            fontWeight={600}
          />
        );
      },
    }),
    columnHelper.accessor('type', {
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
        const player = row.original;
        return (
          <select
            value={row.getValue('type')}
            onChange={(e) =>
              void handleChangePlayerType(player.id, e.target.value as 'human' | 'bot')
            }
            disabled={!ready}
            className="typeSelect"
            onClick={(e) => e.stopPropagation()}
          >
            <option value="human">Human</option>
            <option value="bot">Bot</option>
          </select>
        );
      },
    }),
    columnHelper.accessor('createdAt', {
      header: ({ column }) => (
        <button
          className="sortableHeader"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Created
          <span className="sortIcon">
            {column.getIsSorted() === 'asc' ? ' ↑' : column.getIsSorted() === 'desc' ? ' ↓' : ''}
          </span>
        </button>
      ),
      cell: ({ row }) => (
        <span className="secondaryText">{formatDate(row.getValue('createdAt'))}</span>
      ),
    }),
  ];

  if (loading) {
    return (
      <Card>
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead style={{ background: 'var(--color-surface-subtle)' }}>
              <tr>
                <th
                  scope="col"
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    background: 'var(--color-surface-subtle)',
                    color: 'var(--color-surface-subtle-foreground)',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      font: 'inherit',
                      color: 'inherit',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    Player Name
                    <span style={{ fontSize: '0.75rem' }}>↕</span>
                  </button>
                </th>
                <th
                  scope="col"
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    background: 'var(--color-surface-subtle)',
                    color: 'var(--color-surface-subtle-foreground)',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      font: 'inherit',
                      color: 'inherit',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    Type
                    <span style={{ fontSize: '0.75rem' }}>↕</span>
                  </button>
                </th>
                <th
                  scope="col"
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    background: 'var(--color-surface-subtle)',
                    color: 'var(--color-surface-subtle-foreground)',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      font: 'inherit',
                      color: 'inherit',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    Created
                    <span style={{ fontSize: '0.75rem' }}>↕</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {skeletonRows.map((_, idx) => (
                <tr
                  key={`skeleton-${idx}`}
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                >
                  <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <Skeleton style={{ width: '8rem', height: '1rem' }} />
                      <Skeleton style={{ width: '6rem', height: '0.75rem' }} />
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                    <Skeleton style={{ width: '5.5rem', height: '1rem' }} />
                  </td>
                  <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                    <Skeleton style={{ width: '6rem', height: '0.75rem' }} />
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
    <DataTable
      data={players}
      columns={columns}
      onRowClick={handlePlayerClick}
      emptyMessage={
        showArchived ? 'No archived players to display.' : 'No active players to display.'
      }
    />
  );
}
