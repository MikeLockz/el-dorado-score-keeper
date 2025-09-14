'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, Button } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import { listGames, type GameRecord } from '@/lib/state/io';

export default function QuickLinks() {
  const { ready, height } = useAppState();
  const [recents, setRecents] = React.useState<GameRecord[] | null>(null);

  React.useEffect(() => {
    let closed = false;
    void (async () => {
      try {
        const all = await listGames();
        if (!closed) setRecents(all.slice(0, 3));
      } catch (_err) {
        if (!closed) setRecents([]);
      }
    })();
    return () => {
      closed = true;
    };
  }, []);

  const showResume = ready && height > 0;

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
              <Link href="/" aria-label="Resume current game">
                Resume current game
              </Link>
            </Button>
          ) : null}
        </div>
        <div className="mt-3">
          {recents === null ? (
            <div className="text-muted-foreground">Loading recent sessions…</div>
          ) : recents.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">Recent:</span>
              {recents.map((g, i) => (
                <React.Fragment key={g.id}>
                  <Link
                    href={`/games/view?id=${encodeURIComponent(g.id)}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {g.title || 'Untitled'}
                  </Link>
                  {i < recents.length - 1 ? (
                    <span className="text-muted-foreground">•</span>
                  ) : null}
                </React.Fragment>
              ))}
              <span className="grow" />
              <Link href="/games" className="text-primary underline-offset-4 hover:underline">
                View All
              </Link>
            </div>
          ) : (
            <div className="text-muted-foreground">Your games will appear here.</div>
          )}
        </div>
      </Card>
    </section>
  );
}
