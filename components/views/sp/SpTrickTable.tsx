import React from 'react';
import clsx from 'clsx';

import { CardGlyph } from '@/components/ui';
import type { Suit, Rank } from '@/lib/single-player/types';

import styles from './sp-trick-table.module.scss';

export default function SpTrickTable(props: {
  rotated: string[];
  playerName: (id: string) => string;
  bids: Record<string, number | undefined>;
  trickCounts: Record<string, number | undefined>;
  playedCards: Record<string, { suit: Suit; rank: Rank } | null> | null;
  winnerId: string | null;
}) {
  const { rotated, playerName, bids, trickCounts, playedCards, winnerId } = props;
  return (
    <section className={styles.root} aria-label="Current trick">
      <div className={styles.headerRow}>
        <div>Player</div>
        <div>Bid</div>
        <div>Tricks</div>
        <div className={styles.headerCard}>Card</div>
      </div>
      {rotated.map((pid) => {
        const bid = bids[pid] ?? 0;
        const tricks = trickCounts[pid] ?? 0;
        const played = playedCards?.[pid] ?? null;
        const isWinner = !!winnerId && winnerId === pid;
        return (
          <div className={styles.rowWrapper} key={pid}>
            <div className={clsx(styles.row, isWinner && styles.rowWinner)}>
              <div className={styles.playerName}>{playerName(pid)}</div>
              <div className={styles.numeric}>{bid}</div>
              <div className={styles.numeric}>{tricks}</div>
              <div className={styles.cardCell}>
                {played ? (
                  <CardGlyph suit={played.suit} rank={played.rank} size="sm" />
                ) : (
                  <span className={styles.cardEmpty}>—</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
