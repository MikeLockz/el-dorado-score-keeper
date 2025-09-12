'use client';

import React from 'react';
import { useAppState } from '@/components/state-provider';
import { CardGlyph } from '@/components/ui';
import {
  events,
  selectPlayersOrdered,
  selectSpRotatedOrder,
  selectSpLiveOverlay,
  selectSpTrumpInfo,
  selectSpDealerName,
  selectSpTricksForRound,
  selectSpHandBySuit,
  selectSpReveal,
  selectSpIsRoundDone,
} from '@/lib/state';
import { roundDelta, selectCumulativeScoresAllRounds, type AppEvent } from '@/lib/state';
import { bots, finalizeRoundIfDone, type Card as SpCard } from '@/lib/single-player';

type Props = {
  humanId: string;
  rng: () => number;
};

export default function SinglePlayerMobile({ humanId, rng }: Props) {
  const { state, append, appendMany, isBatchPending } = useAppState();
  const players = selectPlayersOrdered(state);
  const playerName = (pid: string) => players.find((p) => p.id === pid)?.name ?? pid;

  const sp = state.sp;
  const spPhase = sp?.phase ?? 'setup';
  const spRoundNo = sp?.roundNo ?? 0;
  const spOrder: string[] = sp?.order ?? [];
  const spHands = (sp?.hands ?? {}) as Record<string, SpCard[]>;
  const spTrickCounts: Record<string, number> = React.useMemo(
    () => sp?.trickCounts ?? {},
    [sp?.trickCounts],
  );
  const spTrump = sp?.trump;
  const reveal = selectSpReveal(state);

  const overlay = spPhase === 'playing' ? selectSpLiveOverlay(state) : null;
  const rotated = selectSpRotatedOrder(state);
  const tricksThisRound = selectSpTricksForRound(state);
  const { trump, trumpCard } = selectSpTrumpInfo(state);
  const dealerName = selectSpDealerName(state);
  const isRoundDone = selectSpIsRoundDone(state);
  // tricksThisRound used directly where needed

  const totalsByRound = React.useMemo(() => selectCumulativeScoresAllRounds(state), [state]);
  const roundTotals = totalsByRound[spRoundNo] ?? {};
  const humanScore = roundTotals[humanId] ?? 0;
  const rd = state.rounds[spRoundNo];
  const humanBid = rd?.bids?.[humanId] ?? 0;
  const humanMade = rd?.made?.[humanId] ?? null;
  const humanDelta = humanMade == null ? 0 : roundDelta(humanBid, humanMade);
  const roundState = (state.rounds[spRoundNo]?.state ?? 'locked') as
    | 'locked'
    | 'bidding'
    | 'playing'
    | 'complete'
    | 'scored';
  const labelForRoundState = (s: typeof roundState) =>
    s === 'locked'
      ? 'Locked'
      : s === 'bidding'
        ? 'Active'
        : s === 'playing'
          ? 'Playing'
          : s === 'complete'
            ? 'Complete'
            : 'Scored';

  const handsCompleted = Object.values(spTrickCounts ?? {}).reduce((a, n) => a + (n ?? 0), 0);
  // Count the current hand in-progress only when not revealing; during reveal the trick has
  // already been counted in trickCounts.
  const handNow = handsCompleted + (!reveal && (sp?.trickPlays?.length ?? 0) > 0 ? 1 : 0);

  const humanBySuit = selectSpHandBySuit(state, humanId);
  const suitOrder: Array<'spades' | 'hearts' | 'diamonds' | 'clubs'> = [
    'spades',
    'hearts',
    'diamonds',
    'clubs',
  ];

  const [selected, setSelected] = React.useState<SpCard | null>(null);
  const isSelected = (c: SpCard) =>
    selected && selected.suit === c.suit && selected.rank === c.rank;

  const canPlayCard = (c: SpCard) => {
    if (spPhase !== 'playing') return false;
    if (state.sp?.reveal) return false;
    const ledSuit = sp?.trickPlays?.[0]?.card?.suit;
    const canFollow = (spHands[humanId] ?? []).some((h) => h.suit === ledSuit);
    let legal = true;
    if (!ledSuit) {
      const hasNonTrump = (spHands[humanId] ?? []).some((h) => h.suit !== spTrump);
      if (!sp?.trumpBroken && hasNonTrump && c.suit === spTrump) legal = false;
    } else if (canFollow) {
      legal = c.suit === ledSuit;
    }
    // Turn check
    const leader = sp?.trickPlays?.[0]?.playerId ?? sp?.leaderId ?? null;
    const leaderIdx = spOrder.findIndex((p) => p === leader);
    const rotatedOrder =
      leaderIdx < 0 ? spOrder : [...spOrder.slice(leaderIdx), ...spOrder.slice(0, leaderIdx)];
    const nextToPlay = rotatedOrder[sp?.trickPlays?.length ?? 0];
    const isHumansTurn = nextToPlay === humanId && !state.sp?.reveal;
    return legal && isHumansTurn;
  };

  const playCard = async (c: SpCard) => {
    if (!canPlayCard(c)) return;
    await append(events.spTrickPlayed({ playerId: humanId, card: { suit: c.suit, rank: c.rank } }));
    setSelected(null);
  };

  const onConfirmBid = async (bid: number) => {
    if (isBatchPending) return;
    if (spPhase !== 'bidding') return;
    const r = spRoundNo;
    const batch: AppEvent[] = [events.bidSet({ round: r, playerId: humanId, bid })];
    for (const p of spOrder) {
      if (p === humanId) continue;
      const currentBid = state.rounds[r]?.bids?.[p] ?? null;
      if (currentBid == null) {
        const amount = bots.botBid(
          {
            trump: spTrump!,
            hand: spHands[p] ?? [],
            tricksThisRound: tricksThisRound,
            seatIndex: spOrder.findIndex((x) => x === p),
            bidsSoFar: state.rounds[r]?.bids ?? {},
            selfId: p,
            rng,
          },
          'normal',
        );
        batch.push(events.bidSet({ round: r, playerId: p, bid: amount }));
      }
    }
    batch.push(events.roundStateSet({ round: r, state: 'playing' }));
    batch.push(events.spPhaseSet({ phase: 'playing' }));
    await appendMany(batch);
  };

  // Sheet state: simple tap-to-cycle among peek/mid/full
  type SheetState = 'peek' | 'mid' | 'full';
  const [sheet, setSheet] = React.useState<SheetState>('peek');
  const cycleSheet = () => setSheet((s) => (s === 'peek' ? 'mid' : s === 'mid' ? 'full' : 'peek'));

  // No end-of-round confirmation modal; advancing clears reveal and lets engine finalize

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      {/* Top Bar */}
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b px-2 py-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            <span className="mr-2">Round {spRoundNo}</span>
            <span className="mx-1">•</span>
            <span>Dealer: {dealerName ?? '—'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <span className="text-muted-foreground">Trump:</span>
              {trump && trumpCard ? (
                <CardGlyph suit={trump} rank={trumpCard.rank} size="sm" />
              ) : (
                '—'
              )}
            </span>
            <button
              type="button"
              className={`px-2 py-0.5 rounded border text-xs ${state.sp?.trumpBroken ? 'border-emerald-500 text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground'}`}
              onClick={() =>
                void append(events.spTrumpBrokenSet({ broken: !state.sp?.trumpBroken }))
              }
              aria-pressed={state.sp?.trumpBroken ? 'true' : 'false'}
              aria-label="Toggle trump broken"
            >
              Broken: {state.sp?.trumpBroken ? 'Yes' : 'No'}
            </button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="inline-grid grid-flow-col items-baseline gap-1">
            <span className="text-[10px] text-muted-foreground">Hand</span>
            <span className="font-semibold text-sm">
              {handNow}/{tricksThisRound}
            </span>
          </div>
          <div className="inline-grid grid-flow-col items-baseline gap-1">
            <span className="text-[10px] text-muted-foreground">Tricks</span>
            <span className="font-semibold text-sm">{handsCompleted}</span>
          </div>
          <div className="inline-grid grid-flow-col items-baseline gap-1">
            <span className="text-[10px] text-muted-foreground">Score</span>
            <span className="font-semibold text-sm tabular-nums">{humanScore}</span>
          </div>
          <div className="inline-grid grid-flow-col items-baseline gap-1">
            <span className="text-[10px] text-muted-foreground">Delta</span>
            <span className="font-semibold text-sm tabular-nums">
              {humanDelta >= 0 ? `+${humanDelta}` : humanDelta}
            </span>
          </div>
          <div className="inline-grid grid-flow-col items-baseline gap-1">
            <span className="text-[10px] text-muted-foreground">State</span>
            <span className="font-semibold text-sm">{labelForRoundState(roundState)}</span>
          </div>
        </div>
        {/* Bidding controls moved near hand dock */}
      </header>

      {/* Surface: Compact Trick Table + Bottom Sheet (overlayed) */}
      <main className="relative flex-1">
        {/* Compact Table */}
        <section className="grid gap-1 p-2 pb-28" aria-label="Current trick">
          <div className="grid grid-cols-[minmax(64px,1fr)_36px_52px_64px] text-[10px] text-muted-foreground">
            <div>Player</div>
            <div>Bid</div>
            <div>Tricks</div>
            <div className="text-right">Card</div>
          </div>
          {rotated.map((pid) => {
            const bid = state.rounds[spRoundNo]?.bids?.[pid] ?? 0;
            const tricks = spTrickCounts?.[pid] ?? 0;
            const played = overlay?.cards?.[pid] ?? null;
            const isWinner = reveal && reveal.winnerId === pid;
            return (
              <div
                key={pid}
                className={`grid grid-cols-[minmax(64px,1fr)_36px_52px_64px] items-center gap-1 rounded px-1 py-0.5 border ${isWinner ? 'border-emerald-500 bg-emerald-500/5' : 'border-border bg-card/60'}`}
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

        {/* Bottom Sheet */}
        <aside
          className={`fixed left-0 right-0 bottom-0 z-30 bg-card border-t transition-transform ${
            sheet === 'peek'
              ? 'translate-y-full'
              : sheet === 'mid'
                ? 'translate-y-[40dvh]'
                : 'translate-y-[6dvh]'
          }`}
        >
          <div
            className="text-center py-1 text-muted-foreground select-none cursor-ns-resize"
            onClick={cycleSheet}
            title="Tap to expand/collapse"
          >
            ▄▄▄
          </div>
          <div className="max-h-[80dvh] overflow-auto p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between py-1">
              <div>Score</div>
              <div className="tabular-nums">{humanScore}</div>
            </div>
            <div className="flex items-center justify-between py-1 text-muted-foreground">
              <div>This round</div>
              <div className="tabular-nums">{humanDelta >= 0 ? `+${humanDelta}` : humanDelta}</div>
            </div>
            <hr className="my-2" />
            <div className="text-xs text-muted-foreground mb-1">Bids</div>
            <div className="flex flex-wrap gap-3">
              {spOrder.map((pid) => (
                <div key={`bid-${pid}`}>
                  {playerName(pid)}: <strong>{state.rounds[spRoundNo]?.bids?.[pid] ?? 0}</strong>
                </div>
              ))}
            </div>
            {reveal && (
              <div className="mt-2 flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-muted-foreground mr-1">Hand Winner:</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {playerName(reveal.winnerId)}
                  </span>
                </div>
                <button
                  type="button"
                  className="rounded bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 text-sm"
                  disabled={isBatchPending}
                  onClick={() => {
                    const winnerId = reveal.winnerId;
                    void appendMany([
                      events.spFinalizeHoldSet({ hold: false }),
                      events.spTrickCleared({ winnerId }),
                      events.spLeaderSet({ leaderId: winnerId }),
                      events.spTrickRevealClear({}),
                    ]);
                  }}
                >
                  {(() => {
                    const total = Object.values(spTrickCounts ?? {}).reduce(
                      (a, n) => a + (n ?? 0),
                      0,
                    );
                    return total >= tricksThisRound ? 'Next Round' : 'Next Hand';
                  })()}
                </button>
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="rounded border px-2 py-1 text-sm"
                onClick={() =>
                  void append(events.spTrumpBrokenSet({ broken: !state.sp?.trumpBroken }))
                }
              >
                {state.sp?.trumpBroken ? 'Unmark Trump Broken' : 'Mark Trump Broken'}
              </button>
            </div>
          </div>
        </aside>
      </main>

      {/* Hand Dock */}
      <section
        className="fixed left-0 right-0 z-40 border-t bg-background shadow"
        style={{ bottom: 'calc(var(--safe-area-inset-bottom, 0px) + 52px)' }}
        aria-label="Your hand"
      >
        {spPhase === 'bidding' && (
          <div className="px-2 py-2 border-b bg-card flex items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground">Your bid</span>
            <button
              type="button"
              className="h-7 w-7 rounded border bg-sky-700 text-white"
              onClick={() =>
                void append(
                  events.bidSet({
                    round: spRoundNo,
                    playerId: humanId,
                    bid: Math.max(0, humanBid - 1),
                  }),
                )
              }
              disabled={isBatchPending || humanBid <= 0}
              aria-label="Decrease bid"
            >
              −
            </button>
            <span className="font-bold text-base min-w-[1.5rem] text-center">{humanBid}</span>
            <button
              type="button"
              className="h-7 w-7 rounded border bg-sky-700 text-white"
              onClick={() =>
                void append(
                  events.bidSet({
                    round: spRoundNo,
                    playerId: humanId,
                    bid: Math.min(tricksThisRound, humanBid + 1),
                  }),
                )
              }
              disabled={isBatchPending || humanBid >= tricksThisRound}
              aria-label="Increase bid"
            >
              +
            </button>
            <button
              type="button"
              className="ml-1 h-7 px-2 rounded border bg-emerald-700 text-white"
              onClick={() => void onConfirmBid(humanBid)}
              disabled={isBatchPending}
            >
              Confirm
            </button>
          </div>
        )}
        {(() => {
          const totalCards = suitOrder.reduce((acc, s) => acc + (humanBySuit[s]?.length ?? 0), 0);
          if (totalCards === 0) {
            return (
              <div className="p-2 text-center text-xs text-muted-foreground">
                No cards dealt yet
              </div>
            );
          }
          return (
            <div className="p-1">
              <div className="flex flex-wrap gap-3">
                {suitOrder.map((s) => (
                  <div key={`suit-group-${s}`} className="flex gap-1">
                    {humanBySuit[s].map((c, i) => (
                      <button
                        key={`card-${s}-${c.rank}-${i}`}
                        className={`h-14 w-10 rounded border flex items-center justify-center font-bold select-none ${
                          s === 'hearts' || s === 'diamonds' ? 'text-red-600 dark:text-red-300' : ''
                        } ${isSelected(c) ? 'ring-2 ring-sky-500' : ''} ${canPlayCard(c) ? '' : 'opacity-40'}`}
                        onClick={() =>
                          setSelected((prev) =>
                            prev && prev.suit === c.suit && prev.rank === c.rank ? null : c,
                          )
                        }
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void playCard(c);
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
        })()}
      </section>

      {/* Actions Bar */}
      <nav
        className="fixed left-0 right-0 bottom-0 z-30 grid grid-cols-2 gap-2 px-2 py-2 border-t bg-background/85 backdrop-blur"
        style={{ minHeight: 52 }}
        aria-label="Primary actions"
      >
        <button className="text-muted-foreground" onClick={cycleSheet} aria-label="Round details">
          Details
        </button>
        <button
          className="rounded bg-primary text-primary-foreground px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => {
            if (isBatchPending) return;
            // If reveal is active, clear it first; engine will then finalize automatically
            if (reveal) {
              const winnerId = reveal.winnerId;
              void appendMany([
                events.spFinalizeHoldSet({ hold: false }),
                events.spTrickCleared({ winnerId }),
                events.spLeaderSet({ leaderId: winnerId }),
                events.spTrickRevealClear({}),
              ]);
              return;
            }
            const batch = finalizeRoundIfDone(state, { now: Date.now() });
            if (batch.length > 0) void appendMany(batch);
          }}
          disabled={isBatchPending || (!reveal && !isRoundDone)}
          aria-disabled={isBatchPending || (!reveal && !isRoundDone) ? true : false}
        >
          Finalize
        </button>
      </nav>
      {/* No end-of-round confirmation modal */}
    </div>
  );
}
