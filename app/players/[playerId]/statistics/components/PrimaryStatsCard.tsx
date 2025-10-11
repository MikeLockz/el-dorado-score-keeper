'use client';

import React from 'react';

import type { PrimaryMetrics } from '@/lib/state/player-statistics';

import styles from './PrimaryStatsCard.module.scss';

export type PrimaryStatsCardProps = Readonly<{
  loading: boolean;
  metrics: PrimaryMetrics | null;
  loadError?: string | null;
}>;

const integerFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat(undefined, {
  style: 'percent',
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const metricLabels: Array<keyof PrimaryMetrics> = [
  'totalGamesPlayed',
  'totalGamesWon',
  'winRatePercent',
];

const friendlyLabels: Record<keyof PrimaryMetrics, string> = {
  totalGamesPlayed: 'Total games',
  totalGamesWon: 'Wins',
  winRatePercent: 'Win rate',
};

function formatMetricValue(name: keyof PrimaryMetrics, value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (name === 'winRatePercent') {
    return percentFormatter.format(value / 100);
  }
  return integerFormatter.format(value);
}

export function PrimaryStatsCard({
  loading,
  metrics,
  loadError,
}: PrimaryStatsCardProps): JSX.Element {
  const displayMetrics = metrics ?? null;
  const showEmpty = !loading && (!displayMetrics || displayMetrics.totalGamesPlayed === 0);

  return (
    <div className={styles.root}>
      <div className={styles.metrics} role="list">
        {metricLabels.map((metricKey) => {
          const metricValue = displayMetrics?.[metricKey] ?? 0;
          const formatted = formatMetricValue(metricKey, metricValue);
          return (
            <div key={metricKey} className={styles.metric} role="listitem">
              <div className={styles.label}>{friendlyLabels[metricKey]}</div>
              <div className={styles.value} aria-live={loading ? 'polite' : undefined}>
                {loading ? '...' : formatted}
              </div>
            </div>
          );
        })}
      </div>
      {showEmpty ? (
        <div className={styles.empty} role="status">
          {loadError
            ? 'Historical data unavailable. Metrics reflect live games only.'
            : 'Complete a game to unlock win insights.'}
        </div>
      ) : null}
    </div>
  );
}
