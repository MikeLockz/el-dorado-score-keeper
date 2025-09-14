import React from 'react';
import { CardGlyph } from '@/components/ui';
import type { Suit, Rank } from '@/lib/single-player/types';

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
    <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b px-2 py-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="inline-grid grid-flow-col items-baseline gap-1">
          <span className="text-muted-foreground">Hand:</span>
          <span className="font-semibold text-sm">
            {handNow}/{tricksThisRound}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="text-muted-foreground">Trump:</span>
            {trump && trumpCard ? <CardGlyph suit={trump} rank={trumpCard.rank} size="sm" /> : '—'}
          </span>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="inline-grid grid-flow-col items-baseline gap-1">
          <span className="text-[10px] text-muted-foreground">Dealer: {dealerName ?? '—'}</span>
        </div>
        <span className="inline-flex items-center">
          <span className="text-[10px] text-muted-foreground">
            Broken: {trumpBroken ? 'Yes' : 'No'}
          </span>
        </span>
      </div>
    </header>
  );
}
