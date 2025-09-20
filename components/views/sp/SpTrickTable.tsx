import React from 'react';
import { CardGlyph } from '@/components/ui';
import type { Suit, Rank } from '@/lib/single-player/types';

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
    <section className="grid gap-1 p-2 pb-28" aria-label="Current trick">
      <div className="grid grid-cols-[minmax(64px,1fr)_36px_52px_64px] text-[10px] text-muted-foreground">
        <div>Player</div>
        <div>Bid</div>
        <div>Tricks</div>
        <div className="text-right">Card</div>
      </div>
      {rotated.map((pid) => {
        const bid = bids[pid] ?? 0;
        const tricks = trickCounts[pid] ?? 0;
        const played = playedCards?.[pid] ?? null;
        const isWinner = !!winnerId && winnerId === pid;
        const rowClasses = isWinner
          ? 'border-2 text-status-scored-foreground font-semibold shadow-md ring-status-scored/70'
          : 'border border-border/60 bg-card/60';
        const style = isWinner
          ? ({ borderColor: 'var(--color-status-scored)' } as React.CSSProperties)
          : undefined;
        return (
          <div
            key={pid}
            className={`grid grid-cols-[minmax(64px,1fr)_36px_52px_64px] items-center gap-1 rounded px-2 py-1 transition-all ${rowClasses}`}
            style={style}
          >
            <div className="truncate text-sm">{playerName(pid)}</div>
            <div className="text-sm tabular-nums text-center">{bid}</div>
            <div className="text-sm tabular-nums text-center">{tricks}</div>
            <div className="text-sm text-right">
              {played ? (
                <CardGlyph suit={played.suit} rank={played.rank} size="sm" />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
