'use client';

import React from 'react';
import clsx from 'clsx';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';

import { Button, EditableCell, useToast, DataTable } from '@/components/ui';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/format';
import { selectRostersOrdered, resolveRosterRoute, events } from '@/lib/state';
import { captureBrowserException } from '@/lib/observability/browser';
import type { RosterSummary } from '@/lib/state';

type Roster = RosterSummary;

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
};

export function RostersTable({
  rosters: externalRosters,
  onRostersChange,
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

  return (
    <DataTable
      data={rosters}
      columns={columns}
      onRowClick={handleRosterClick}
      emptyMessage="No active rosters to display."
      defaultSorting={[{ id: 'createdAt', desc: true }]}
    />
  );
}
