'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card } from '@/components/ui';
import { type GameRecord, getGame, restoreGame } from '@/lib/state';
import { analyzeGame } from '@/lib/analytics';
import { formatDuration } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';

function GameDetailPageInner() {
  const search = useSearchParams();
  const id = search.get('id') || '';
  const [game, setGame] = React.useState<GameRecord | null | undefined>(undefined);
  const router = useRouter();

  React.useEffect(() => {
    let on = true;
    void (async () => {
      try {
        const rec = id ? await getGame(undefined, id) : null;
        if (on) setGame(rec);
      } catch (e) {
        console.warn('Failed to load game', e);
        if (on) setGame(null);
      }
    })();
    return () => {
      on = false;
    };
  }, [id]);

  const onRestore = async () => {
    if (!game) return;
    if (!confirm('Restore this game as current? Current progress will be replaced.')) return;
    await restoreGame(undefined, game.id);
    // Navigate to current game view; avoid reload which may cancel navigation
    router.replace('/');
  };

  // Always call hooks unconditionally; compute stats only when game is present.
  const stats = React.useMemo(() => (game ? analyzeGame(game) : null), [game]);

  if (!id) {
    return <div className="p-3 max-w-2xl mx-auto">Missing id.</div>;
  }
  if (game === undefined) {
    return <div className="p-3 max-w-2xl mx-auto">Loading…</div>;
  }
  if (!game) {
    return <div className="p-3 max-w-2xl mx-auto">Game not found.</div>;
  }

  const scoresEntries = Object.entries(game.summary.scores);
  const playersById = game.summary.playersById;
  const sp = game.summary.sp;

  return (
    <div className="p-3 max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-bold">{game.title || 'Game'}</h1>
          <div className="text-sm text-muted-foreground">
            Finished {formatDateTime(game.finishedAt)}
          </div>
        </div>
        <Button onClick={() => void onRestore()}>Restore</Button>
      </div>

      <Card className="p-2 mb-3">
        <div className="font-semibold mb-2">Final Scores</div>
        {scoresEntries.length === 0 ? (
          <div className="text-muted-foreground text-sm">No players</div>
        ) : (
          <div className="grid grid-cols-[1fr_auto] gap-x-4 text-sm">
            <div className="font-bold">Player</div>
            <div className="font-bold text-right">Score</div>
            {scoresEntries
              .sort((a, b) => b[1] - a[1])
              .map(([pid, score]) => (
                <React.Fragment key={pid}>
                  <div className="py-1">{playersById[pid] ?? pid}</div>
                  <div className="py-1 text-right font-mono">{score}</div>
                </React.Fragment>
              ))}
          </div>
        )}
      </Card>

      {sp && (
        <Card className="p-2 mb-3">
          <div className="font-semibold mb-2">Single-Player Snapshot</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div className="text-muted-foreground">Phase</div>
            <div className="font-mono">{sp.phase}</div>
            <div className="text-muted-foreground">Round</div>
            <div className="font-mono">{sp.roundNo ?? '—'}</div>
            <div className="text-muted-foreground">Dealer</div>
            <div className="font-mono">{playersById[sp.dealerId ?? ''] ?? sp.dealerId ?? '—'}</div>
            <div className="text-muted-foreground">Leader</div>
            <div className="font-mono">{playersById[sp.leaderId ?? ''] ?? sp.leaderId ?? '—'}</div>
            <div className="text-muted-foreground">Trump</div>
            <div className="font-mono">
              {sp.trump && sp.trumpCard ? `${sp.trumpCard.rank} of ${sp.trump}` : '—'}
            </div>
            <div className="text-muted-foreground">Trump Broken</div>
            <div className="font-mono">{sp.trumpBroken ? 'yes' : 'no'}</div>
          </div>
        </Card>
      )}

      <Card className="p-2">
        <div className="text-sm text-foreground">
          Events: {game.bundle.events.length} • Seq: {game.lastSeq}
        </div>
      </Card>

      <Card className="p-2 mt-3">
        <div className="font-semibold mb-2">Statistics</div>
        {/* Leaders */}
        <div className="grid grid-cols-1 gap-3 text-sm mb-3">
          <div>
            <div className="font-bold mb-1">Leaders</div>
            <div className="space-y-0.5">
              <div>
                <span className="text-foreground mr-1">Most Total Bid:</span>
                <span className="font-medium">
                  {stats?.leaders.mostTotalBid
                    ? `${stats.leaders.mostTotalBid.name} (${stats.leaders.mostTotalBid.totalBid})`
                    : '—'}
                </span>
              </div>
              <div>
                <span className="text-foreground mr-1">Least Total Bid:</span>
                <span className="font-medium">
                  {stats?.leaders.leastTotalBid
                    ? `${stats.leaders.leastTotalBid.name} (${stats.leaders.leastTotalBid.totalBid})`
                    : '—'}
                </span>
              </div>
              <div>
                <span className="text-foreground mr-1">Highest Single Bid:</span>
                <span className="font-medium">
                  {stats?.leaders.highestSingleBid
                    ? `${stats.leaders.highestSingleBid.name} (R${stats.leaders.highestSingleBid.round}: ${stats.leaders.highestSingleBid.bid})`
                    : '—'}
                </span>
              </div>
              <div>
                <span className="text-foreground mr-1">Biggest Single Loss:</span>
                <span className="font-medium">
                  {stats?.leaders.biggestSingleLoss
                    ? `${stats.leaders.biggestSingleLoss.name} (R${stats.leaders.biggestSingleLoss.round}: -${stats.leaders.biggestSingleLoss.loss})`
                    : '—'}
                </span>
              </div>
            </div>
          </div>
          <div>
            <div className="font-bold mb-1">Totals</div>
            <div className="space-y-0.5">
              <div>
                <span className="text-foreground mr-1">Total Points Bid:</span>
                <span className="font-medium">{stats?.totals.totalPointsBid ?? '—'}</span>
              </div>
              <div>
                <span className="text-foreground mr-1">Hands Won:</span>
                <span className="font-medium">{stats?.totals.totalHandsWon ?? '—'}</span>
              </div>
              <div>
                <span className="text-foreground mr-1">Hands Lost:</span>
                <span className="font-medium">{stats?.totals.totalHandsLost ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Rounds table */}
        <div className="text-sm">
          <div className="font-bold mb-1">Rounds</div>
          <div className="grid grid-cols-[auto_auto_auto] gap-x-4">
            <div className="font-bold text-right">Round</div>
            <div className="font-bold text-right">Sum Bids</div>
            <div className="font-bold">Status</div>
            {(stats?.rounds ?? [])
              .slice()
              .sort((a, b) => b.tricks - a.tricks)
              .map((r) => {
                const badgeClass =
                  r.overUnder === 'over'
                    ? 'border-destructive bg-destructive/15 text-destructive'
                    : r.overUnder === 'under'
                      ? 'border-border bg-surface-muted text-surface-muted-foreground'
                      : 'border-status-scored bg-status-scored/15 text-status-scored';
                return (
                  <React.Fragment key={r.round}>
                    <div className="py-0.5 text-right">{r.tricks}</div>
                    <div className="py-0.5 text-right">{r.sumBids}</div>
                    <div className="py-0.5">
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[0.7rem] font-semibold capitalize border ${badgeClass}`}
                      >
                        {r.overUnder}
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
          </div>
        </div>

        {/* Timing */}
        <div className="grid grid-cols-3 gap-3 text-sm mt-3">
          <div>
            <div className="font-bold">Started</div>
            <div className="text-foreground">
              {stats ? formatDateTime(stats.timing.startedAt) : '—'}
            </div>
          </div>
          <div>
            <div className="font-bold">Ended</div>
            <div className="text-foreground">
              {stats ? formatDateTime(stats.timing.finishedAt) : '—'}
            </div>
          </div>
          <div>
            <div className="font-bold">Duration</div>
            <div className="text-foreground">
              {stats ? formatDuration(stats.timing.durationMs) : '—'}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function GameDetailPage() {
  return (
    <React.Suspense fallback={<div className="p-3 max-w-2xl mx-auto">Loading…</div>}>
      <GameDetailPageInner />
    </React.Suspense>
  );
}
