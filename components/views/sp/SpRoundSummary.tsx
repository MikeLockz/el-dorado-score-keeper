import React from 'react';
import type { Suit, Rank } from '@/lib/single-player/types';

export type PlayerSummary = Readonly<{
  id: string;
  name: string;
  bid: number | null;
  made: boolean | null;
  delta: number | null;
  total: number;
}>;

export default function SpRoundSummary(props: {
  roundNo: number;
  trump: Suit | null;
  dealerName: string | null;
  nextLeaderName: string | null;
  players: ReadonlyArray<PlayerSummary>;
  autoCanceled: boolean;
  remainingMs: number;
  onCancelAuto: () => void;
  onContinue: () => void;
  isLastRound: boolean;
  disabled?: boolean;
}) {
  const {
    roundNo,
    trump,
    dealerName,
    nextLeaderName,
    players,
    autoCanceled,
    remainingMs,
    onCancelAuto,
    onContinue,
    isLastRound,
    disabled,
  } = props;
  const autoSecs = Math.ceil((remainingMs ?? 0) / 1000);
  return (
    <div
      className="relative min-h-[100dvh] pb-[calc(52px+env(safe-area-inset-bottom))]"
      onPointerDown={onCancelAuto}
    >
      <header className="p-3 border-b">
        <div className="text-xs text-muted-foreground">Round {roundNo} Summary</div>
        <div className="text-sm flex gap-3 mt-1 text-muted-foreground">
          <div>
            Trump: <span className="font-medium">{trump ?? '—'}</span>
          </div>
          <div>
            Dealer: <span className="font-medium">{dealerName ?? '—'}</span>
          </div>
          <div>
            Next Leader: <span className="font-medium">{nextLeaderName ?? '—'}</span>
          </div>
        </div>
      </header>
      <main className="p-3">
        <div className="grid grid-cols-1 gap-2 text-sm">
          {players.map((p) => (
            <div
              key={`sum-${p.id}`}
              className="flex items-center justify-between rounded border px-2 py-1"
            >
              <div className="flex-1">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  Bid {p.bid ?? '—'} · {p.made == null ? '—' : p.made ? 'Made' : 'Set'} ·{' '}
                  {p.delta == null ? '—' : p.delta >= 0 ? `+${p.delta}` : p.delta}
                </div>
              </div>
              <div className="text-right min-w-[3rem] tabular-nums">{p.total}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          {autoCanceled ? 'Auto-advance canceled' : `Auto-advance in ${autoSecs}s… (tap to cancel)`}
        </div>
      </main>
      <nav
        className="fixed left-0 right-0 bottom-0 z-30 grid grid-cols-2 gap-2 px-2 py-2 border-t bg-background/85 backdrop-blur"
        style={{ minHeight: 52 }}
      >
        <button className="text-muted-foreground" aria-label="Round details" onClick={onCancelAuto}>
          Details
        </button>
        <button
          className="rounded bg-primary text-primary-foreground px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onContinue}
          disabled={!!disabled}
        >
          {isLastRound ? 'Finish Game' : 'Next Round'}
        </button>
      </nav>
    </div>
  );
}
