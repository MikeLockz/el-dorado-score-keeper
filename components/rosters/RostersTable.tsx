'use client';

import React from 'react';
import clsx from 'clsx';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';

import { Button, EditableCell, useToast, DataTable, Skeleton, Card } from '@/components/ui';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/format';
import { selectRostersOrdered, resolveRosterRoute, events } from '@/lib/state';
import { captureBrowserException } from '@/lib/observability/browser';
import type { RosterSummary } from '@/lib/state';

type Roster = RosterSummary;

const skeletonRows = Array.from({ length: 4 });

const describeError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
};

const reportRosterError = (action: string, error: Error) => {
  const reason = error.message || describeError(error);
  captureBrowserException(error, {
    scope: 'rosters-table',
    action,
    reason,
  });
};

const runWithRosterError = async (action: string, op: () => Promise<void>, toastContext: any) => {
  try {
    await op();
    return true;
  } catch (error: unknown) {
    const normalized = error instanceof Error ? error : new Error(describeError(error));
    reportRosterError(action, normalized);
    toastContext({
      title: 'Action failed',
      description: normalized.message || 'Please try again.',
      variant: 'destructive',
    });
    return false;
  }
};

type RostersTableProps = {
  rosters?: Roster[];
  onRostersChange?: () => void;
  emptyMessage?: string;
  loading?: boolean;
};

export function RostersTable({
  rosters: externalRosters,
  onRostersChange,
  emptyMessage,
  loading = false,
}: RostersTableProps = {}) {
  const router = useRouter();
  const { toast } = useToast();
  const rosters = externalRosters || [];

  const handleRosterClick = React.useCallback(
    (roster: Roster) => {
      router.push(`/rosters/${roster.rosterId}`);
    },
    [router],
  );

  // Roster name editing handler
  const handleSaveRosterName = React.useCallback(
    async (rosterId: string, newName: string) => {
      const ok = await runWithRosterError(
        'rename-roster',
        async () => {
          await events.rosterRenamed({ rosterId, name: newName });
        },
        toast,
      );
      if (ok) {
        onRostersChange?.();
      }
    },
    [events.rosterRenamed, onRostersChange, toast],
  );

  const columnHelper = createColumnHelper<Roster>();

  const columns: ColumnDef<Roster>[] = [
    columnHelper.accessor('name', {
      header: ({ column }) => (
        <button
          className="sortableHeader"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Roster Name
          <span className="sortIcon">
            {column.getIsSorted() === 'asc' ? ' ↑' : column.getIsSorted() === 'desc' ? ' ↓' : ''}
          </span>
        </button>
      ),
      cell: ({ row }) => {
        const roster = row.original;
        return (
          <EditableCell
            value={row.getValue('name')}
            onSave={(newName) => handleSaveRosterName(roster.rosterId, newName)}
            placeholder="Roster name"
            validate={(value) => {
              if (!value.trim()) return 'Roster name is required';
              return null;
            }}
            saveLabel="Save"
            cancelLabel="Cancel"
            errorLabel="Failed to save roster name"
            showEditIcon={true}
            fontWeight={600}
          />
        );
      },
    }),
    columnHelper.accessor('players', {
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
      cell: ({ row }) => (
        <span className="secondaryText">
          {row.getValue('players')} {row.getValue('players') === 1 ? 'player' : 'players'}
        </span>
      ),
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
        const type = row.getValue('type');
        return (
          <span className={clsx('typeBadge', type === 'single' ? 'singleBadge' : 'scorecardBadge')}>
            {type === 'single' ? 'Single Player' : 'Scorecard'}
          </span>
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
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleRosterClick(row.original);
          }}
        >
          View Details
        </Button>
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
                    Roster Name
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
                    Players
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
                  Actions
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
                    <Skeleton style={{ width: '4rem', height: '1rem' }} />
                  </td>
                  <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                    <Skeleton style={{ width: '5.5rem', height: '1rem' }} />
                  </td>
                  <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                    <Skeleton style={{ width: '6rem', height: '0.75rem' }} />
                  </td>
                  <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                    <Skeleton style={{ width: '5rem', height: '2rem' }} />
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
      data={rosters}
      columns={columns}
      onRowClick={handleRosterClick}
      emptyMessage={emptyMessage || 'No active rosters to display.'}
      defaultSorting={[{ id: 'createdAt', desc: true }]}
    />
  );
}
