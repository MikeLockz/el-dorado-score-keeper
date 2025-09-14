import React from 'react';
import { CardGlyph } from '@/components/ui';
import type { Suit, Rank, Card } from '@/lib/single-player/types';

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
    return <div className="p-2 text-center text-xs text-muted-foreground">No cards dealt yet</div>;
  }
  return (
    <div className="p-1">
      <div className="flex flex-wrap gap-3">
        {suitOrder.map((s) => (
          <div key={`suit-group-${s}`} className="flex gap-1">
            {(humanBySuit[s] ?? []).map((c, i) => (
              <button
                key={`card-${s}-${c.rank}-${i}`}
                className={`h-14 w-10 rounded border flex items-center justify-center font-bold select-none transition-shadow ${
                  s === 'hearts' || s === 'diamonds' ? 'text-red-600 dark:text-red-300' : ''
                } ${isSelected(c) ? 'ring-2 ring-sky-500' : 'hover:ring-1 hover:ring-sky-400'} ${
                  isPlaying && !canPlayCard(c) ? 'opacity-40' : ''
                }`}
                onClick={() => onToggleSelect(c)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPlayCard(c);
                }}
                aria-pressed={isSelected(c) ? 'true' : 'false'}
                aria-label={`${c.rank} of ${c.suit}`}
                disabled={!canPlayCard(c)}
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
