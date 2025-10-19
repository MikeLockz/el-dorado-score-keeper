'use client';

import React from 'react';

import type { RoundMetric } from '@/lib/state/player-statistics';

import styles from './RoundAccuracyChart.module.scss';

export type RoundAccuracyChartProps = Readonly<{
  metrics: ReadonlyArray<RoundMetric>;
  loading: boolean;
  loadError?: string | null;
}>;

const percentFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const integerFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

export function RoundAccuracyChart({ metrics, loading, loadError }: RoundAccuracyChartProps) {
  const data = React.useMemo(() => metrics ?? [], [metrics]);
  const hasData = data.some((metric) => metric.accuracyTotal > 0 || metric.bidCount > 0);
  const emptyMessage = loadError
    ? 'Historical data unavailable. Live games will populate round insights once complete.'
    : 'Complete a game to unlock round accuracy insights.';

  const summary = React.useMemo(() => {
    let matches = 0;
    let attempts = 0;
    let bids = 0;
    let highestBid: number | null = null;
    let lowestBid: number | null = null;
    for (const metric of data) {
      matches += metric.accuracyMatches;
      attempts += metric.accuracyTotal;
      bids += metric.bidCount;
      if (metric.highestBid != null) {
        highestBid =
          highestBid == null ? metric.highestBid : Math.max(highestBid, metric.highestBid);
      }
      if (metric.lowestBid != null) {
        lowestBid = lowestBid == null ? metric.lowestBid : Math.min(lowestBid, metric.lowestBid);
      }
    }
    const overallAccuracy = attempts === 0 ? null : Math.round((matches / attempts) * 1000) / 10;
    return { matches, attempts, bids, highestBid, lowestBid, overallAccuracy };
  }, [data]);

  const summaryItems = React.useMemo(
    () => [
      {
        label: 'Overall accuracy',
        value:
          summary.overallAccuracy == null
            ? '—'
            : `${percentFormatter.format(summary.overallAccuracy)}%`,
      },
      {
        label: 'Exact matches',
        value: integerFormatter.format(summary.matches),
        detail: `of ${integerFormatter.format(summary.attempts)} rounds`,
      },
      {
        label: 'Bids logged',
        value: integerFormatter.format(summary.bids),
      },
      {
        label: 'Top bid',
        value: summary.highestBid == null ? '—' : integerFormatter.format(summary.highestBid),
        detail:
          summary.lowestBid == null
            ? undefined
            : `Lowest ${integerFormatter.format(summary.lowestBid)}`,
      },
    ],
    [summary],
  );

  return (
    <div className={styles.root}>
      <div
        className={styles.tableContainer}
        role="region"
        aria-live={loading ? 'polite' : undefined}
      >
        <table className={styles.table} aria-label="Round accuracy details">
          <thead>
            <tr className={styles.headerRow}>
              <th scope="col" className={styles.headerCell}>
                Round
              </th>
              <th scope="col" className={styles.headerCell}>
                Bid accuracy
              </th>
              <th scope="col" className={styles.headerCell}>
                Exact matches
              </th>
              <th scope="col" className={styles.headerCell}>
                Bids logged
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.row}>
                <td className={styles.statusCell} colSpan={4}>
                  Loading round accuracy...
                </td>
              </tr>
            ) : hasData ? (
              data.map((metric) => {
                const hasAttempts = metric.accuracyTotal > 0;
                const accuracyValue =
                  hasAttempts && typeof metric.accuracyPercent === 'number'
                    ? `${percentFormatter.format(metric.accuracyPercent)}%`
                    : '—';
                const matchesDetail = hasAttempts
                  ? `${integerFormatter.format(metric.accuracyMatches)} exact of ${integerFormatter.format(metric.accuracyTotal)} rounds`
                  : '—';
                let bidsDetail = '—';
                if (metric.bidCount > 0) {
                  const range =
                    metric.lowestBid != null && metric.highestBid != null
                      ? ` (${integerFormatter.format(metric.lowestBid)}-${integerFormatter.format(metric.highestBid)})`
                      : '';
                  bidsDetail = `${integerFormatter.format(metric.bidCount)} bids${range}`;
                }

                return (
                  <tr key={`round-${metric.roundNo}`} className={styles.row}>
                    <th scope="row" className={styles.roundCell}>
                      {metric.roundNo}
                    </th>
                    <td className={styles.cell}>{accuracyValue}</td>
                    <td className={styles.cell}>{matchesDetail}</td>
                    <td className={styles.cell}>{bidsDetail}</td>
                  </tr>
                );
              })
            ) : (
              <tr className={styles.row}>
                <td className={styles.emptyCell} colSpan={4}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.summary} role="list">
        {summaryItems.map((item) => (
          <div key={item.label} className={styles.summaryItem} role="listitem">
            <div className={styles.summaryLabel}>{item.label}</div>
            <div className={styles.summaryValue}>{item.value}</div>
            {item.detail ? <div className={styles.summaryDetail}>{item.detail}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
