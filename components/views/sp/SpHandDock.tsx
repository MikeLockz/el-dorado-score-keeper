import React from 'react';
import { CardGlyph } from '@/components/ui';
import type { Suit, Rank, Card } from '@/lib/single-player/types';

import styles from './sp-hand-dock.module.scss';

export default function SpHandDock(props: {
  suitOrder: ReadonlyArray<Suit>;
  humanBySuit: Record<Suit, ReadonlyArray<{ suit: Suit; rank: Rank }>>;
  isPlaying: boolean;
  isSelected: (c: Card) => boolean;
  canPlayCard: (c: Card) => boolean;
  onToggleSelect: (c: Card) => void;
  onPlayCard: (c: Card) => void;
}) {
  const { suitOrder, humanBySuit, isPlaying, isSelected, canPlayCard, onToggleSelect, onPlayCard } =
    props;
  const totalCards = suitOrder.reduce((acc, s) => acc + (humanBySuit[s]?.length ?? 0), 0);
  if (totalCards === 0) {
    return <div className={styles.emptyState}>No cards</div>;
  }
  return (
    <div className={styles.root}>
      <div className={styles.suitList}>
        {suitOrder.map((s) => (
          <div key={`suit-group-${s}`} className={styles.suitGroup}>
            {(humanBySuit[s] ?? []).map((c, i) => (
              <button
                key={`card-${s}-${c.rank}-${i}`}
                className={styles.cardButton}
                onClick={() => onToggleSelect(c)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPlayCard(c);
                }}
                aria-pressed={isSelected(c) ? 'true' : 'false'}
                aria-label={`${c.rank} of ${c.suit}`}
                disabled={!canPlayCard(c)}
                data-suit={s}
                data-selected={isSelected(c) ? 'true' : undefined}
                data-playing={isPlaying ? 'true' : undefined}
                data-unplayable={!canPlayCard(c) ? 'true' : undefined}
              >
                <CardGlyph suit={c.suit} rank={c.rank} size="sm" />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
