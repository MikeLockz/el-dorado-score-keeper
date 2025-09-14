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
import {
  roundDelta,
  selectCumulativeScoresAllRounds,
  type AppEvent,
  ROUNDS_TOTAL,
} from '@/lib/state';
import { bots, computeAdvanceBatch, type Card as SpCard } from '@/lib/single-player';
import { archiveCurrentGameAndReset } from '@/lib/state';

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
  const _isRoundDone = selectSpIsRoundDone(state); // used via computeAdvanceBatch button state/label
  // tricksThisRound used directly where needed

  const totalsByRound = React.useMemo(() => selectCumulativeScoresAllRounds(state), [state]);
  const roundTotals = totalsByRound[spRoundNo] ?? {};
  const humanScore = roundTotals[humanId] ?? 0;
  const rd = state.rounds[spRoundNo];
  const humanBid = rd?.bids?.[humanId] ?? 0;
  const humanMade = rd?.made?.[humanId] ?? null;
  const humanDelta = humanMade == null ? 0 : roundDelta(humanBid, humanMade);
  const isFinalRound = spRoundNo >= ROUNDS_TOTAL;
  const roundState = (state.rounds[spRoundNo]?.state ?? 'locked') as
    | 'locked'
    | 'bidding'
    | 'playing'
    | 'complete'
    | 'scored';
  // Round state label moved to Devtools for debugging visibility

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

  // Summary auto-advance hooks (always declared; guarded inside effect)
  const [autoCanceled, setAutoCanceled] = React.useState(false);
  const [remainingMs, setRemainingMs] = React.useState<number>(0);
  React.useEffect(() => {
    if (spPhase !== 'summary') return;
    const autoMs = 10_000;
    const tick = () => {
      const entered = sp?.summaryEnteredAt ?? Date.now();
      const elapsed = Date.now() - entered;
      const remaining = Math.max(0, autoMs - elapsed);
      setRemainingMs(remaining);
      if (!autoCanceled && remaining === 0) {
        const batch = computeAdvanceBatch(state, Date.now(), {
          intent: 'auto',
          summaryAutoAdvanceMs: autoMs,
        });
        if (batch.length > 0) void appendMany(batch);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state, sp?.summaryEnteredAt, spPhase, autoCanceled, appendMany]);

  // Card selection and play helpers (declare before any returns)
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

  // Sheet state
  type SheetState = 'peek' | 'mid' | 'full';
  const [sheet, setSheet] = React.useState<SheetState>('peek');
  const cycleSheet = () => setSheet((s) => (s === 'peek' ? 'mid' : s === 'mid' ? 'full' : 'peek'));

  if (spPhase === 'summary') {
    const ids = players.map((p) => p.id);
    const bidsMap = (state.rounds[spRoundNo]?.bids ?? {}) as Record<string, number | undefined>;
    const madeMap = (state.rounds[spRoundNo]?.made ?? {}) as Record<
      string,
      boolean | null | undefined
    >;
    const perPlayer = ids.map((id) => {
      const name = playerName(id);
      const bid = bidsMap[id] ?? null;
      const made = madeMap[id] ?? null;
      const delta = bid == null ? null : roundDelta(bid, made);
      const total = state.scores?.[id] ?? 0;
      return { id, name, bid, made, delta, total };
    });
    const nextDealer = (() => {
      const order = spOrder;
      const curDealer = sp?.dealerId ?? order[0];
      const idx = Math.max(0, order.indexOf(curDealer));
      return order[(idx + 1) % order.length] ?? null;
    })();
    const nextLeader = (() => {
      const order = spOrder;
      if (!nextDealer || order.length === 0) return null;
      const idx = Math.max(0, order.indexOf(nextDealer));
      return order[(idx + 1) % order.length] ?? null;
    })();
    const isLastRound = spRoundNo >= 10;
    const autoSecs = Math.ceil(remainingMs / 1000);

    return (
      <div
        className="relative min-h-[100dvh] pb-[calc(52px+env(safe-area-inset-bottom))]"
        onPointerDown={() => setAutoCanceled(true)}
      >
        <header className="p-3 border-b">
          <div className="text-xs text-muted-foreground">Round {spRoundNo} Summary</div>
          <div className="text-sm flex gap-3 mt-1 text-muted-foreground">
            <div>
              Trump: <span className="font-medium">{trump ?? '—'}</span>
            </div>
            <div>
              Dealer: <span className="font-medium">{dealerName ?? '—'}</span>
            </div>
            <div>
              Next Leader:{' '}
              <span className="font-medium">{nextLeader ? playerName(nextLeader) : '—'}</span>
            </div>
          </div>
        </header>
        <main className="p-3">
          <div className="grid grid-cols-1 gap-2 text-sm">
            {perPlayer.map((p) => (
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
            {autoCanceled
              ? 'Auto-advance canceled'
              : `Auto-advance in ${autoSecs}s… (tap to cancel)`}
          </div>
        </main>
        <nav
          className="fixed left-0 right-0 bottom-0 z-30 grid grid-cols-2 gap-2 px-2 py-2 border-t bg-background/85 backdrop-blur"
          style={{ minHeight: 52 }}
        >
          <button
            className="text-muted-foreground"
            aria-label="Round details"
            onClick={() => setAutoCanceled(true)}
          >
            Details
          </button>
          <button
            className="rounded bg-primary text-primary-foreground px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (isBatchPending) return;
              setAutoCanceled(true);
              const batch = computeAdvanceBatch(state, Date.now(), { intent: 'user' });
              if (batch.length > 0) void appendMany(batch);
            }}
            disabled={isBatchPending}
          >
            {isLastRound ? 'Finish Game' : 'Next Round'}
          </button>
        </nav>
      </div>
    );
  }

  // Game Summary Screen (phase === 'game-summary')
  if (spPhase === 'game-summary' || spPhase === 'done') {
    const ids = players.map((p) => p.id);
    const totals = ids.map((id) => ({ id, name: playerName(id), total: state.scores?.[id] ?? 0 }));
    const max = totals.reduce((m, t) => Math.max(m, t.total), Number.NEGATIVE_INFINITY);
    const winners = totals.filter((t) => t.total === max).map((t) => t.name);
    const title =
      winners.length > 1 ? `Winners: ${winners.join(', ')}` : `Winner: ${winners[0] ?? '-'}`;

    return (
      <div className="relative min-h-[100dvh] pb-[calc(52px+env(safe-area-inset-bottom))]">
        <header className="p-3 border-b">
          <div className="text-xs text-muted-foreground">Game Summary</div>
          <div className="text-base font-semibold mt-1">{title}</div>
        </header>
        <main className="p-3">
          <div className="grid grid-cols-1 gap-2 text-sm">
            {totals.map((p) => (
              <div
                key={`gsum-${p.id}`}
                className={`flex items-center justify-between rounded border px-2 py-2 ${p.total === max ? 'border-emerald-400' : ''}`}
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
            onClick={() => {
              if (isBatchPending) return;
              void archiveCurrentGameAndReset();
            }}
            disabled={isBatchPending}
          >
            Play Again
          </button>
        </nav>
      </div>
    );
  }

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

  // No end-of-round confirmation modal; advancing clears reveal and lets engine finalize

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      {/* Top Bar */}
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
              {trump && trumpCard ? (
                <CardGlyph suit={trump} rank={trumpCard.rank} size="sm" />
              ) : (
                '—'
              )}
            </span>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="inline-grid grid-flow-col items-baseline gap-1">
            <span className="text-[10px] text-muted-foreground">Dealer: {dealerName ?? '—'}</span>
          </div>
          <span className="inline-flex items-center">
            <span className="text-[10px] text-muted-foreground">
              Broken: {state.sp?.trumpBroken ? 'Yes' : 'No'}
            </span>
          </span>
          {/* Round state label removed from UI; available in Devtools */}
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
                className={`grid grid-cols-[minmax(64px,1fr)_36px_52px_64px] items-center gap-1 rounded py-0.5 ${isWinner ? 'border-emerald-500 bg-emerald-500/15' : 'border-border bg-card/60'}`}
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
          className={`fixed left-0 right-0 bottom-0 z-50 bg-card border-t transition-transform ${
            sheet === 'peek'
              ? 'translate-y-full'
              : sheet === 'mid'
                ? 'translate-y-[40dvh]'
                : 'translate-y-0'
          }`}
        >
          <div
            className="text-center py-1 text-muted-foreground select-none cursor-ns-resize"
            onClick={cycleSheet}
            title="Tap to expand/collapse"
          >
            ▄▄▄
          </div>
          <div className="max-h-[calc(100dvh-3rem)] overflow-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="text-xs text-muted-foreground mb-1">Bids</div>
            <div className="flex flex-wrap gap-3">
              {spOrder.map((pid) => (
                <div key={`bid-${pid}`}>
                  {playerName(pid)}: <strong>{state.rounds[spRoundNo]?.bids?.[pid] ?? 0}</strong>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground mt-3 mb-1">Scores</div>
            <div className="flex flex-wrap gap-3">
              {spOrder.map((pid) => (
                <div key={`score-${pid}`}>
                  {playerName(pid)}: <strong>{roundTotals[pid] ?? 0}</strong>
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
                  onClick={() => {
                    const batch = computeAdvanceBatch(state, Date.now(), { intent: 'user' });
                    if (batch.length > 0) void appendMany(batch);
                  }}
                >
                  {(() => {
                    const total = Object.values(spTrickCounts ?? {}).reduce(
                      (a, n) => a + (n ?? 0),
                      0,
                    );
                    if (total >= tricksThisRound) return isFinalRound ? 'New Game' : 'Next Round';
                    return 'Next Hand';
                  })()}
                </button>
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="rounded border px-2 py-1 text-sm hover:bg-muted/20"
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

      {/* Last Trick banner (after clear, before next trick starts) */}
      {(() => {
        const snap = sp?.lastTrickSnapshot ?? null;
        const trickIdle = (sp?.trickPlays?.length ?? 0) === 0;
        if (!snap || reveal || !trickIdle) return null;
        return (
          <div className="fixed left-0 right-0 bottom-[calc(52px+3rem)] z-30 mx-2 mb-2 rounded border bg-card px-3 py-2 text-xs shadow">
            <span className="text-muted-foreground">Last Trick:</span>{' '}
            <span className="font-semibold">{playerName(snap.winnerId)}</span>
          </div>
        );
      })()}

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
              className="h-7 w-7 rounded border bg-sky-700 text-white hover:bg-sky-800"
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
              className="h-7 w-7 rounded border bg-sky-700 text-white hover:bg-sky-800"
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
              className="ml-1 h-7 px-2 rounded border bg-emerald-700 text-white hover:bg-emerald-800"
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
                        className={`h-14 w-10 rounded border flex items-center justify-center font-bold select-none transition-shadow ${
                          s === 'hearts' || s === 'diamonds' ? 'text-red-600 dark:text-red-300' : ''
                        } ${isSelected(c) ? 'ring-2 ring-sky-500' : 'hover:ring-1 hover:ring-sky-400'} ${
                          // Keep cards fully visible during bidding, but dim non-interactable cards while playing
                          spPhase === 'playing' && !canPlayCard(c) ? 'opacity-40' : ''
                        }`}
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
        <button
          className="text-muted-foreground hover:text-foreground hover:underline"
          onClick={cycleSheet}
          aria-label="Round details"
        >
          Details
        </button>
        <button
          className="rounded bg-primary text-primary-foreground px-3 py-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => {
            const batch = computeAdvanceBatch(state, Date.now(), { intent: 'user' });
            if (batch.length > 0) void appendMany(batch);
          }}
          disabled={computeAdvanceBatch(state, Date.now(), { intent: 'user' }).length === 0}
          aria-disabled={computeAdvanceBatch(state, Date.now(), { intent: 'user' }).length === 0}
        >
          {reveal
            ? (() => {
                const total = Object.values(spTrickCounts ?? {}).reduce((a, n) => a + (n ?? 0), 0);
                if (total >= tricksThisRound) return isFinalRound ? 'New Game' : 'Next Round';
                return 'Next Hand';
              })()
            : 'Continue'}
        </button>
      </nav>
      {/* No end-of-round confirmation modal */}
    </div>
  );
}
