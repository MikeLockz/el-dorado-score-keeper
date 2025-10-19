'use client';

import React from 'react';
import clsx from 'clsx';

import type { HandInsight } from '@/lib/state/player-statistics';
import { SuitGlyph } from '@/components/ui';

import styles from './HandInsightsCard.module.scss';

type SuitKey = 'clubs' | 'diamonds' | 'hearts' | 'spades';

const suitOrder: SuitKey[] = ['clubs', 'diamonds', 'hearts', 'spades'];

const suitLabels: Record<SuitKey, string> = {
  clubs: 'Clubs',
  diamonds: 'Diamonds',
  hearts: 'Hearts',
  spades: 'Spades',
};

const integerFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

export type HandInsightsCardProps = Readonly<{
  loading: boolean;
  insight: HandInsight | null;
  loadError?: string | null;
}>;

export function HandInsightsCard({ loading, insight, loadError }: HandInsightsCardProps) {
  const totalHands = insight?.handsPlayed ?? 0;
  const hasData = totalHands > 0;
  const topSuit = hasData ? (insight?.topSuit ?? null) : null;

  const emptyMessage = loadError
    ? 'Suit insights are unavailable while historical data is offline.'
    : 'Complete additional games to unlock suit distribution insights.';

  if (!hasData) {
    return (
      <div className={styles.empty} role="status">
        {emptyMessage}
      </div>
    );
  }

  const suitRows = suitOrder.map((suit) => {
    const count = insight?.suitCounts[suit] ?? 0;
    const percent = totalHands === 0 ? 0 : (count / totalHands) * 100;
    const width = percent <= 0 ? 0 : Math.min(100, Math.max(percent, 6));
    return {
      suit,
      label: suitLabels[suit],
      count,
      percent,
      width,
    };
  });

  return (
    <div className={styles.root}>
      <div className={styles.summary}>
        <div className={styles.summaryBlock}>
          <div className={styles.summaryLabel}>Hands played</div>
          <div
            className={styles.summaryValue}
            aria-live={loading ? 'polite' : undefined}
            aria-atomic="true"
          >
            {integerFormatter.format(totalHands)}
          </div>
        </div>
        <div className={styles.summaryBlock}>
          <div className={styles.summaryLabel}>Most frequent suit</div>
          {topSuit ? (
            <div className={styles.topSuit}>
              <SuitGlyph suit={topSuit} title={`${suitLabels[topSuit]} suit`} aria-hidden="true" />
              <div className={styles.topSuitDetails}>
                <span className={styles.topSuitName}>{suitLabels[topSuit]}</span>
                <span
                  className={styles.topSuitCount}
                  aria-label={`${integerFormatter.format(
                    insight?.suitCounts[topSuit] ?? 0,
                  )} plays with ${suitLabels[topSuit]}`}
                >
                  {integerFormatter.format(insight?.suitCounts[topSuit] ?? 0)} plays
                </span>
              </div>
            </div>
          ) : (
            <div className={styles.topSuitFallback}>Multiple suits are tied.</div>
          )}
        </div>
      </div>

      <div className={styles.chart} role="list" aria-label="Suit distribution">
        {suitRows.map(({ suit, label, count, percent, width }) => (
          <div
            key={suit}
            className={clsx(styles.row, topSuit === suit && styles.rowHighlight)}
            role="listitem"
            aria-label={`${label}: ${integerFormatter.format(count)} plays (${formatPercent(percent)})`}
          >
            <div className={styles.rowHeader}>
              <SuitGlyph suit={suit} title={`${label} suit`} aria-hidden="true" />
              <span className={styles.rowLabel}>{label}</span>
              <span className={styles.rowCount}>{integerFormatter.format(count)}</span>
              <span className={styles.rowPercent}>{formatPercent(percent)}</span>
            </div>
            <div className={styles.barTrack} aria-hidden="true">
              <div className={styles.barFill} data-suit={suit} style={{ width: `${width}%` }} />
            </div>
          </div>
        ))}
      </div>

      {topSuit == null ? (
        <div className={styles.tieHint} role="note">
          No single suit leads yet—hands are evenly distributed.
        </div>
      ) : null}
    </div>
  );
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0%';
  }
  return `${percentFormatter.format(value)}%`;
}
