'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import { listGames, type GameRecord, restoreGame } from '@/lib/state/io';
import { formatDateTime } from '@/lib/format';
import { Loader2 } from 'lucide-react';

export default function QuickLinks() {
  const { ready, height } = useAppState();
  const [recents, setRecents] = React.useState<GameRecord[] | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const router = useRouter();

  React.useEffect(() => {
    let closed = false;
    void (async () => {
      try {
        const all = await listGames();
        if (!closed) setRecents(all.slice(0, 3));
      } catch {
        if (!closed) setRecents([]);
      }
    })();
    return () => {
      closed = true;
    };
  }, []);

  const showResume = ready && height > 0;

  const resumeGame = React.useCallback(
    async (game: GameRecord) => {
      if (pendingId) return;
      setPendingId(game.id);
      try {
        await restoreGame(undefined, game.id);
        const mode = deriveMode(game);
        router.push(mode === 'single-player' ? '/single-player' : '/scorecard');
      } catch (error) {
        console.warn('Failed to resume game from quick links', error);
        setPendingId(null);
      } finally {
        setPendingId((prev) => (prev === game.id ? null : prev));
      }
    },
    [pendingId, router],
  );

  return (
    <section className="space-y-2" aria-label="Quick Links">
      <h2 className="text-base font-semibold">Quick Links</h2>
      <Card className="p-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/rules" className="text-primary underline-offset-4 hover:underline">
            How To Play
          </Link>
          {showResume ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/scorecard" aria-label="Resume current game">
                Resume current game
              </Link>
            </Button>
          ) : null}
        </div>
        <div className="mt-3">
          {recents === null ? (
            <div className="text-muted-foreground">Loading recent sessions…</div>
          ) : recents.length > 0 ? (
            <div className="space-y-2">
              {recents.map((game) => {
                const mode = deriveMode(game);
                const handLabel = deriveHandLabel(game, mode);
                const playersLabel = derivePlayersLabel(game.summary.players);
                const lastPlayed = formatDateTime(game.finishedAt);
                const pending = pendingId === game.id;
                return (
                  <div
                    key={game.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Resume ${modeLabel(mode)} from ${lastPlayed}`}
                    aria-disabled={pending || undefined}
                    onClick={() => {
                      if (pending) return;
                      void resumeGame(game);
                    }}
                    onKeyDown={(event) => {
                      if (pending) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void resumeGame(game);
                      }
                    }}
                    className={`flex flex-col gap-2 rounded-md border border-border/70 bg-card/60 px-3 py-2 transition hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:flex-row sm:items-center sm:justify-between ${pending ? 'opacity-70' : ''}`}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-foreground">{modeLabel(mode)}</span>
                      <span className="text-muted-foreground">•</span>
                      <span>{playersLabel}</span>
                      {handLabel ? (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <span>{handLabel}</span>
                        </>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-xs text-muted-foreground">{lastPlayed}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (pending) return;
                          void resumeGame(game);
                        }}
                        disabled={pending}
                      >
                        {pending ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Resume
                          </span>
                        ) : (
                          'Resume'
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-end">
                <Link href="/games" className="text-primary underline-offset-4 hover:underline">
                  View all games
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">Your games will appear here.</div>
          )}
        </div>
      </Card>
    </section>
  );
}

function deriveMode(game: GameRecord): 'single-player' | 'scorecard' {
  if (game.summary.mode === 'single-player' || game.summary.mode === 'scorecard') {
    return game.summary.mode;
  }
  const spPhase = game.summary.sp?.phase;
  if (spPhase && spPhase !== 'setup' && spPhase !== 'game-summary' && spPhase !== 'done') {
    return 'single-player';
  }
  return 'scorecard';
}

function modeLabel(mode: 'single-player' | 'scorecard'): string {
  return mode === 'single-player' ? 'Single Player' : 'Score Card';
}

function deriveHandLabel(game: GameRecord, mode: 'single-player' | 'scorecard'): string | null {
  if (mode === 'single-player') {
    const round = game.summary.sp?.roundNo ?? null;
    if (round && round > 0) return `Hand ${round}`;
    return null;
  }
  const round = game.summary.scorecard?.activeRound ?? null;
  if (round && round > 0) return `Round ${round}`;
  return null;
}

function derivePlayersLabel(count: number): string {
  if (count === 1) return '1 player';
  return `${count} players`;
}
