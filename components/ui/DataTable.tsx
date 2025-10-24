'use client';

import React from 'react';
import clsx from 'clsx';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';

import styles from './DataTable.module.scss';

export type DataTableProps<T extends RowData> = {
  data: T[];
  columns: ColumnDef<T>[];
  onRowClick?: (row: T, event?: React.MouseEvent) => void;
  emptyMessage?: string;
  defaultSorting?: SortingState;
  className?: string;
};

export function DataTable<T extends RowData>({
  data,
  columns,
  onRowClick,
  emptyMessage = 'No data to display',
  defaultSorting = [],
  className,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>(defaultSorting);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    onSortingChange: setSorting,
  });

  if (data.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={clsx(styles.tableContainer, className)}>
      {/* Desktop Table View */}
      <div className={styles.desktopView}>
        <table className={styles.dataTable}>
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
                onClick={(e) => onRowClick?.(row.original, e)}
                style={{ cursor: onRowClick ? 'pointer' : 'default' }}
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
            onClick={(e) => onRowClick?.(row.original, e)}
            style={{ cursor: onRowClick ? 'pointer' : 'default' }}
          >
            <div className={styles.mobileCardContent}>
              {row.getVisibleCells().map((cell) => (
                <div key={cell.id} className={styles.mobileCell}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
