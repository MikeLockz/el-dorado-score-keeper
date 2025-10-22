'use client';

import React from 'react';
import clsx from 'clsx';
import { Activity, Flame, LineChart, TrendingDown, TrendingUp } from 'lucide-react';

import type { AdvancedMetrics } from '@/lib/state/player-statistics';
import { SuitGlyph } from '@/components/ui';

import styles from './AdvancedInsightsPanel.module.scss';

export type AdvancedInsightsPanelProps = Readonly<{
  loading: boolean;
  metrics: AdvancedMetrics | null;
  loadError?: string | null;
}>;

type SuitKey = 'clubs' | 'diamonds' | 'hearts' | 'spades';

const suits: ReadonlyArray<{ key: SuitKey; label: string }> = Object.freeze([
  { key: 'clubs', label: 'Clubs' },
  { key: 'diamonds', label: 'Diamonds' },
  { key: 'hearts', label: 'Hearts' },
  { key: 'spades', label: 'Spades' },
]);

const percentFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const deltaFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const scoreFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

export function AdvancedInsightsPanel({ loading, metrics, loadError }: AdvancedInsightsPanelProps) {
  const volatility = metrics?.scoreVolatility;
  const momentum = metrics?.momentum;

  const sparkline = React.useMemo(
    () => buildSparklinePath(momentum?.rollingAverageScores.map((entry) => entry.average) ?? []),
    [momentum?.rollingAverageScores],
  );

  if (!metrics) {
    const emptyMessage = loadError
      ? 'Advanced analytics are unavailable while historical data is offline.'
      : 'Complete a few games to unlock streak, volatility, and suit mastery insights.';
    return (
      <div className={styles.empty} role="status">
        {emptyMessage}
      </div>
    );
  }

  const trickAverage = metrics.trickEfficiency.averageDelta;
  const perfectStreak = metrics.trickEfficiency.perfectBidStreak;

  const suitRows = suits.map(({ key, label }) => {
    const winRate = metrics.suitMastery.trumpWinRateBySuit[key] ?? null;
    const trickSuccess = metrics.suitMastery.trickSuccessBySuit[key] ?? null;
    return { key, label, winRate, trickSuccess };
  });

  const highlightedSuit = suitRows.reduce<SuitKey | null>((best, row) => {
    if (row.trickSuccess == null) {
      return best;
    }
    if (best == null) {
      return row.key;
    }
    const current = metrics.suitMastery.trickSuccessBySuit[best] ?? null;
    if (current == null || row.trickSuccess > current) {
      return row.key;
    }
    return best;
  }, null);

  const rollingWindow = Math.min(momentum!.rollingAverageScores.length, 5);
  const momentumHint = loading
    ? 'Calculating rolling average momentum…'
    : rollingWindow > 0
      ? `Rolling average covers the last ${rollingWindow} ${rollingWindow === 1 ? 'game' : 'games'}.`
      : 'Rolling average appears after you complete your next game.';

  return (
    <div className={styles.root}>
      <section className={styles.section} aria-label="Trick efficiency">
        <header className={styles.sectionHeader}>
          <Activity size={18} aria-hidden="true" />
          <span>Trick efficiency</span>
        </header>
        <div className={styles.metricGrid}>
          <MetricTile
            label="Avg trick delta"
            description="Difference between tricks won and bids placed."
            value={loading ? '...' : formatDelta(trickAverage)}
          />
          <MetricTile
            label="Perfect bid streak"
            description="Longest consecutive rounds with perfect bids."
            value={loading ? '...' : formatInteger(perfectStreak)}
            icon={<Flame size={16} aria-hidden="true" />}
          />
        </div>
      </section>

      <section className={styles.section} aria-label="Suit mastery">
        <header className={styles.sectionHeader}>
          <LineChart size={18} aria-hidden="true" />
          <span>Suit mastery</span>
        </header>
        <div className={styles.suitTable} role="table" aria-label="Suit mastery breakdown">
          <div className={clsx(styles.suitRow, styles.suitHeader)} role="row">
            <div className={styles.suitCell} role="columnheader" aria-sort="none">
              Suit
            </div>
            <div className={styles.suitMetric} role="columnheader">
              Trump win rate
            </div>
            <div className={styles.suitMetric} role="columnheader">
              Trick success
            </div>
          </div>
          {suitRows.map(({ key, label, winRate, trickSuccess }) => (
            <div
              key={key}
              className={clsx(styles.suitRow, highlightedSuit === key && styles.suitHighlight)}
              role="row"
              aria-label={`${label}: trump win rate ${formatPercent(winRate)}, trick success ${formatPercent(trickSuccess)}`}
            >
              <div className={styles.suitCell} role="cell">
                <SuitGlyph suit={key} title={`${label} suit`} aria-hidden="true" />
                <span>{label}</span>
              </div>
              <div className={styles.suitMetric} role="cell">
                {loading ? '...' : formatPercent(winRate)}
              </div>
              <div className={styles.suitMetric} role="cell">
                {loading ? '...' : formatPercent(trickSuccess)}
              </div>
            </div>
          ))}
        </div>
        {highlightedSuit == null ? (
          <div className={styles.suitHint} role="note">
            Play additional rounds to unlock suit mastery comparisons.
          </div>
        ) : null}
      </section>

      <section className={styles.section} aria-label="Score volatility">
        <header className={styles.sectionHeader}>
          <TrendingUp size={18} aria-hidden="true" />
          <span>Score volatility</span>
        </header>
        <div className={styles.metricGrid}>
          <MetricTile
            label="Score deviation"
            description="How widely scores vary across completed games."
            value={loading ? '...' : formatScore(volatility.standardDeviation)}
          />
          <MetricTile
            label="Largest comeback"
            description="Biggest deficit overcome in a winning game."
            value={loading ? '...' : formatScore(volatility.largestComeback)}
            icon={<TrendingUp size={16} aria-hidden="true" />}
          />
          <MetricTile
            label="Largest lead lost"
            description="Greatest lead surrendered in a loss."
            value={loading ? '...' : formatScore(volatility.largestLeadBlown)}
            icon={<TrendingDown size={16} aria-hidden="true" />}
          />
        </div>
      </section>

      <section className={styles.section} aria-label="Momentum">
        <header className={styles.sectionHeader}>
          <TrendingUp size={18} aria-hidden="true" />
          <span>Momentum</span>
        </header>
        <div className={styles.sparklineWrapper}>
          {loading ? (
            <div className={styles.sparklineEmpty}>Calculating rolling average…</div>
          ) : sparkline ? (
            <svg
              className={styles.sparkline}
              viewBox="0 0 240 80"
              role="img"
              aria-label="Rolling average score trend"
            >
              <path className={styles.sparklinePath} d={sparkline} />
            </svg>
          ) : (
            <div className={styles.sparklineEmpty}>
              Play additional games to unlock momentum trends.
            </div>
          )}
        </div>
        <div className={styles.momentumGrid}>
          <MetricTile
            label="Current win streak"
            description="Consecutive wins including the latest game."
            value={loading ? '...' : formatInteger(momentum.currentWinStreak)}
          />
          <MetricTile
            label="Best win streak"
            description="Longest run of consecutive victories."
            value={loading ? '...' : formatInteger(momentum.longestWinStreak)}
          />
        </div>
        <div
          className={styles.sparklineWrapper}
          role="img"
          aria-label="Rolling average score trend"
        >
          {sparkline ? (
            <svg
              className={styles.sparkline}
              viewBox="0 0 240 80"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d={sparkline} className={styles.sparklinePath} />
            </svg>
          ) : (
            <span className={styles.sparklineEmpty}>
              Play a few more games to unlock momentum trends.
            </span>
          )}
        </div>
        <p className={styles.momentumHint} role="note">
          {momentumHint}
        </p>
      </section>
    </div>
  );
}

type MetricTileProps = Readonly<{
  label: string;
  description: string;
  value: string;
  icon?: React.ReactNode;
}>;

function MetricTile({ label, description, value, icon }: MetricTileProps) {
  return (
    <div className={styles.metricTile} role="group" aria-roledescription="metric">
      <div className={styles.metricHeading}>
        {icon ? <span className={styles.metricIcon}>{icon}</span> : null}
        <span className={styles.metricLabel}>{label}</span>
      </div>
      <div className={styles.metricValue} aria-live="polite">
        {value}
      </div>
      <p className={styles.metricDescription}>{description}</p>
    </div>
  );
}

function formatDelta(value: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  if (value === 0) {
    return '0.0';
  }
  const formatted = deltaFormatter.format(Math.abs(value));
  return value > 0 ? `+${formatted}` : `-${formatted}`;
}

function formatInteger(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return Math.trunc(value).toString();
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return `${percentFormatter.format(value)}%`;
}

function formatScore(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return scoreFormatter.format(value);
}

function buildSparklinePath(values: ReadonlyArray<number>): string | null {
  if (!values || values.length < 2) {
    return null;
  }
  const width = 240;
  const height = 80;
  const padding = 12;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const toPoint = (value: number, index: number) => {
    const x =
      values.length === 1
        ? padding
        : padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return [x, y] as const;
  };
  const [startX, startY] = toPoint(values[0]!, 0);
  const segments = values
    .slice(1)
    .map((value, index) => {
      const [x, y] = toPoint(value, index + 1);
      return `L ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  return `M ${startX.toFixed(2)} ${startY.toFixed(2)} ${segments}`;
}
