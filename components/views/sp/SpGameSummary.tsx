import React from 'react';

export type GameTotal = Readonly<{ id: string; name: string; total: number; isWinner: boolean }>;

export default function SpGameSummary(props: {
  title: string;
  players: ReadonlyArray<GameTotal>;
  onPlayAgain: () => void;
  disabled?: boolean;
  seed?: number | null;
}) {
  const { title, players, onPlayAgain, disabled, seed } = props;
  return (
    <div className="relative min-h-[100dvh] pb-[calc(52px+env(safe-area-inset-bottom))]">
      <header className="p-3 border-b">
        <div className="text-xs text-muted-foreground">Game Summary</div>
        <div className="text-base font-semibold mt-1">{title}</div>
        {typeof seed === 'number' && Number.isFinite(seed) && (
          <div className="mt-1 text-xs text-muted-foreground">Seed: {seed}</div>
        )}
      </header>
      <main className="p-3">
        <div className="grid grid-cols-1 gap-2 text-sm">
          {players.map((p) => (
            <div
              key={`gsum-${p.id}`}
              className={`flex items-center justify-between rounded border px-2 py-2 ${p.isWinner ? 'border-emerald-400' : ''}`}
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-right min-w-[3rem] tabular-nums font-semibold">{p.total}</div>
            </div>
          ))}
        </div>
      </main>
      <nav
        className="fixed left-0 right-0 bottom-0 z-30 grid grid-cols-2 gap-2 px-2 py-2 border-t bg-background/85 backdrop-blur"
        style={{ minHeight: 52 }}
      >
        <button className="text-muted-foreground" aria-label="Round details" onClick={() => {}}>
          Details
        </button>
        <button
          className="rounded bg-primary text-primary-foreground px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onPlayAgain}
          disabled={!!disabled}
        >
          Play Again
        </button>
      </nav>
    </div>
  );
}
