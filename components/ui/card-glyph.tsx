import React from 'react';

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

function suitContrastClass(suit: Suit): string {
  // For red suits, use lighter red on dark chip (light mode) and darker red on light chip (dark mode)
  // For black suits, inherit the chip text color.
  if (suit === 'hearts' || suit === 'diamonds') return 'text-red-300 dark:text-red-700';
  return '';
}

export function CardGlyph({
  suit,
  rank,
  className,
  size = 'md',
  title,
}: {
  suit: Suit;
  rank: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}) {
  const pad = size === 'sm' ? 'px-1 py-0.5' : size === 'lg' ? 'px-2 py-1' : 'px-1.5 py-0.5';
  const text = size === 'sm' ? 'text-[0.8rem]' : size === 'lg' ? 'text-lg' : 'text-base';
  const rankText = size === 'sm' ? 'text-[0.8rem]' : size === 'lg' ? 'text-lg' : 'text-base';

  return (
    <span
      className={
        `inline-flex items-center gap-1 rounded border ${pad} ${text} ` +
        // In light mode, make chip dark; in dark mode, make chip light for contrast
        // Always add a subtle border to separate from backgrounds
        `bg-gray-900 text-white dark:bg-white dark:text-gray-900 border-border ` +
        (className ?? '')
      }
      title={title ?? `${rankLabel(rank)} of ${suit}`}
    >
      <span className={`font-bold leading-none ${rankText}`}>{rankLabel(rank)}</span>
      <span className={`${suitContrastClass(suit)} leading-none`}>{suitSymbol(suit)}</span>
    </span>
  );
}

export function SuitGlyph({ suit, className, title }: { suit: Suit; className?: string; title?: string }) {
  return (
    <span
      className={
        `inline-flex items-center rounded border px-1 py-0.5 text-sm ` +
        `bg-gray-900 text-white dark:bg-white dark:text-gray-900 border-border ` +
        (className ?? '')
      }
      title={title ?? suit}
    >
      <span className={`${suitContrastClass(suit)}`}>{suitSymbol(suit)}</span>
    </span>
  );
}

