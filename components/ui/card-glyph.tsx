import React from 'react';
import clsx from 'clsx';

import styles from './card-glyph.module.scss';

type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

function suitSymbol(suit: Suit): string {
  return suit === 'spades' ? '♠' : suit === 'hearts' ? '♥' : suit === 'diamonds' ? '♦' : '♣';
}

function rankLabel(rank: number): string {
  return rank === 14
    ? 'A'
    : rank === 13
      ? 'K'
      : rank === 12
        ? 'Q'
        : rank === 11
          ? 'J'
          : String(rank);
}

export function CardGlyph({
  suit,
  rank,
  className,
  size = 'md',
  title,
  padded = false,
}: {
  suit: Suit;
  rank: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
  padded?: boolean;
}) {
  return (
    <span
      data-slot="card-glyph"
      data-size={size}
      data-suit={suit}
      data-padded={padded ? 'true' : undefined}
      className={clsx(styles.cardGlyph, className)}
      title={title ?? `${rankLabel(rank)} of ${suit}`}
    >
      <span className={styles.rank}>{rankLabel(rank)}</span>
      <span className={styles.suit}>{suitSymbol(suit)}</span>
    </span>
  );
}

export function SuitGlyph({
  suit,
  className,
  title,
}: {
  suit: Suit;
  className?: string;
  title?: string;
}) {
  return (
    <span
      data-slot="suit-glyph"
      data-suit={suit}
      className={clsx(styles.suitGlyph, className)}
      title={title ?? suit}
    >
      <span className={styles.suitGlyphSymbol}>{suitSymbol(suit)}</span>
    </span>
  );
}
