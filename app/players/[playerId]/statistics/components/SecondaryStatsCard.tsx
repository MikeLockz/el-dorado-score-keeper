'use client';

import React from 'react';
import clsx from 'clsx';
import { Activity, TrendingDown, TrendingUp } from 'lucide-react';

import type { SecondaryMetrics } from '@/lib/state/player-statistics';

import styles from './SecondaryStatsCard.module.scss';

export type SecondaryStatsCardProps = Readonly<{
  loading: boolean;
  metrics: SecondaryMetrics | null;
  loadError?: string | null;
}>;

const integerFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

const averageFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

type MetricConfig = Readonly<{
  key: keyof SecondaryMetrics;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  trend?: 'up' | 'down';
  formatter: (value: number | null) => string;
}>;

const metricConfigs: ReadonlyArray<MetricConfig> = [
  {
    key: 'averageScore',
    label: 'Average score',
    icon: Activity,
    formatter: (value) => (value == null ? '—' : averageFormatter.format(value)),
  },
  {
    key: 'highestScore',
    label: 'Best game',
    icon: TrendingUp,
    trend: 'up',
    formatter: (value) => (value == null ? '—' : integerFormatter.format(value)),
  },
  {
    key: 'lowestScore',
    label: 'Toughest game',
    icon: TrendingDown,
    trend: 'down',
    formatter: (value) => (value == null ? '—' : integerFormatter.format(value)),
  },
];

export function SecondaryStatsCard({
  loading,
  metrics,
  loadError,
}: SecondaryStatsCardProps): JSX.Element {
  const showEmpty = !loading && (!metrics || metrics.averageScore == null);
  const emptyMessage = loadError
    ? 'Historical data unavailable. Live games will populate score insights when complete.'
    : 'Complete a game to unlock score trends.';

  return (
    <div className={styles.root}>
      <div className={styles.metrics} role="list">
        {metricConfigs.map((config) => {
          const value = metrics?.[config.key] ?? null;
          const Icon = config.icon;
          const metricClass = clsx(
            styles.metric,
            config.trend === 'up' && styles.metricUp,
            config.trend === 'down' && styles.metricDown,
          );
          return (
            <div key={config.key} className={metricClass} role="listitem">
              <span className={styles.icon} aria-hidden="true">
                <Icon size={18} strokeWidth={2} />
              </span>
              <div className={styles.metricContent}>
                <div className={styles.label}>{config.label}</div>
                <div className={styles.value} aria-live={loading ? 'polite' : undefined}>
                  {loading ? '...' : config.formatter(value)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {showEmpty ? (
        <div className={styles.empty} role="status">
          {emptyMessage}
        </div>
      ) : null}
    </div>
  );
}
