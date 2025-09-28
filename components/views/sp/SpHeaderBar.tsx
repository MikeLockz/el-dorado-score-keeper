import React from 'react';

import { CardGlyph } from '@/components/ui';
import type { Suit, Rank } from '@/lib/single-player/types';

import styles from './sp-header-bar.module.scss';

export default function SpHeaderBar(props: {
  handNow: number;
  tricksThisRound: number;
  trump: Suit | null;
  trumpCard: { suit: Suit; rank: Rank } | null;
  dealerName: string | null;
  trumpBroken: boolean;
}) {
  const { handNow, tricksThisRound, trump, trumpCard, dealerName, trumpBroken } = props;
  return (
    <header className={styles.root}>
      <div className={styles.primaryRow}>
        <div className={styles.metricGroup}>
          <span className={styles.metricLabel}>Hand:</span>
          <span className={styles.metricValue}>
            {handNow}/{tricksThisRound}
          </span>
        </div>
        <div className={styles.trumpGroup}>
          <span className={styles.metaGroup}>
            <span className={styles.metricLabel}>Trump:</span>
            {trump && trumpCard ? (
              <CardGlyph suit={trump} rank={trumpCard.rank} size="sm" padded />
            ) : (
              '—'
            )}
          </span>
        </div>
      </div>
      <div className={styles.secondaryRow}>
        <div className={styles.metaGroup}>
          <span className={styles.metaText}>Dealer: </span>
          <span className={styles.metaTextStrong}>{dealerName ?? '—'}</span>
        </div>
        <span className={styles.metaGroup}>
          <span className={styles.metaText}>Broken: </span>
          <span className={styles.metaTextStrong}>{trumpBroken ? 'Yes' : 'No'}</span>
        </span>
      </div>
    </header>
  );
}
