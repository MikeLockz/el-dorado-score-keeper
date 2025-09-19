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
  // Hearts/diamonds lean on the destructive token so red suits stay aligned with theme palettes.
  if (suit === 'hearts' || suit === 'diamonds') return 'text-destructive';
  return '';
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
  const text = size === 'sm' ? 'text-[0.8rem]' : size === 'lg' ? 'text-lg' : 'text-base';
  const rankText = size === 'sm' ? 'text-[0.8rem]' : size === 'lg' ? 'text-lg' : 'text-base';

  return (
    <span
      className={
        // Fill parent container (width/height) while keeping content centered
        `box-border w-full h-full inline-flex items-center justify-center gap-1 rounded border ${text} ` +
        (padded ? 'p-0.5 ' : '') +
        // In light mode, make chip dark; in dark mode, make chip light for contrast
        // Always add a subtle border to separate from backgrounds
        `bg-foreground text-background border-border ` +
        (className ?? '')
      }
      title={title ?? `${rankLabel(rank)} of ${suit}`}
    >
      <span className={`font-bold leading-none ${rankText}`}>{rankLabel(rank)}</span>
      <span className={`${suitContrastClass(suit)} leading-none`}>{suitSymbol(suit)}</span>
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
      className={
        `inline-flex items-center rounded border px-1 py-0.5 text-sm ` +
        `bg-foreground text-background border-border ` +
        (className ?? '')
      }
      title={title ?? suit}
    >
      <span className={`${suitContrastClass(suit)}`}>{suitSymbol(suit)}</span>
    </span>
  );
}
