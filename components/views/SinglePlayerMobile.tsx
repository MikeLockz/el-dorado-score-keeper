'use client';

import React from 'react';
import { useAppState } from '@/components/state-provider';
import {
  events,
  selectPlayersOrderedFor,
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
import { canPlayCard as ruleCanPlayCard } from '@/lib/rules/sp';
import { archiveCurrentGameAndReset } from '@/lib/state';
import SpRoundSummary from './sp/SpRoundSummary';
import SpGameSummary from './sp/SpGameSummary';
import SpHeaderBar from './sp/SpHeaderBar';
import SpTrickTable from './sp/SpTrickTable';
import SpHandDock from './sp/SpHandDock';

type Props = {
  humanId: string;
  rng: () => number;
};

export default function SinglePlayerMobile({ humanId, rng }: Props) {
  const { state, append, appendMany, isBatchPending } = useAppState();
  const players = selectPlayersOrderedFor(state, 'single');
  const playerName = (pid: string) => players.find((p) => p.id === pid)?.name ?? pid;

  const sp = state.sp;
  const spPhase = sp?.phase ?? 'setup';
  // Use store-driven round number for all indexing
  const spRoundNo = sp?.roundNo ?? 0;
  const spOrder: string[] = sp?.order ?? [];
  const spHands = sp?.hands ?? {};
  const spTrickCounts: Record<string, number> = React.useMemo(
    () => sp?.trickCounts ?? {},
    [sp?.trickCounts],
  );
  const spTrump = sp?.trump;
  const reveal = selectSpReveal(state);

  const overlay = spPhase === 'playing' ? selectSpLiveOverlay(state) : null;
  const rotated = selectSpRotatedOrder(state);
  // Derive tricks using selector tied to store state
  const tricksThisRound = selectSpTricksForRound(state);
  const { trump, trumpCard } = selectSpTrumpInfo(state);
  const dealerName = selectSpDealerName(state);
  const _isRoundDone = selectSpIsRoundDone(state); // used via computeAdvanceBatch button state/label
  // tricksThisRound used directly where needed

  const totalsByRound = React.useMemo(() => selectCumulativeScoresAllRounds(state), [state]);
  const roundTotals = totalsByRound[spRoundNo] ?? {};
  const rd = state.rounds[spRoundNo];
  const humanBid = rd?.bids?.[humanId] ?? 0;
  const isFinalRound = spRoundNo >= ROUNDS_TOTAL;
  // Round state label moved to Devtools for debugging visibility

  const handsCompleted = Object.values(spTrickCounts ?? {}).reduce((a, n) => a + (n ?? 0), 0);
  // Count the current hand in-progress only when not revealing; during reveal the trick has
  // already been counted in trickCounts.
  const handNow = handsCompleted + (!reveal && (sp?.trickPlays?.length ?? 0) > 0 ? 1 : 0);
  const totalTricksSoFar = React.useMemo(
    () => Object.values(spTrickCounts ?? {}).reduce((a, n) => a + (n ?? 0), 0),
    [spTrickCounts],
  );

  const humanBySuit = selectSpHandBySuit(state, humanId);
  const suitOrder: Array<'spades' | 'hearts' | 'diamonds' | 'clubs'> = [
    'spades',
    'hearts',
    'diamonds',
    'clubs',
  ];
  // Memoized user-intent advance batch computed at top level per render
  const userAdvanceBatch = React.useMemo(
    () => computeAdvanceBatch(state, Date.now(), { intent: 'user' }),
    [state],
  );

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
    !!selected && selected.suit === c.suit && selected.rank === c.rank;
  const canPlayCard = (c: SpCard) => {
    if (spPhase !== 'playing') return false;
    if (state.sp?.reveal) return false;
    if (!spTrump) return false;
    const ok = ruleCanPlayCard(
      {
        order: spOrder,
        leaderId: sp?.leaderId ?? null,
        trickPlays: (sp?.trickPlays ?? []).map((p) => ({
          playerId: p.playerId,
          card: { suit: p.card.suit, rank: p.card.rank },
        })),
        hands: spHands,
        trump: spTrump,
        trumpBroken: !!sp?.trumpBroken,
      },
      humanId,
      { suit: c.suit, rank: c.rank },
    );
    return ok.ok;
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
      const curDealer = sp?.dealerId ?? order[0] ?? '';
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
    return (
      <SpRoundSummary
        roundNo={spRoundNo}
        trump={trump}
        dealerName={dealerName}
        nextLeaderName={nextLeader ? playerName(nextLeader) : null}
        players={perPlayer}
        autoCanceled={autoCanceled}
        remainingMs={remainingMs}
        onCancelAuto={() => setAutoCanceled(true)}
        onContinue={() => {
          if (isBatchPending) return;
          setAutoCanceled(true);
          const batch = computeAdvanceBatch(state, Date.now(), { intent: 'user' });
          if (batch.length > 0) void appendMany(batch);
        }}
        isLastRound={isLastRound}
        disabled={isBatchPending}
      />
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
      <SpGameSummary
        title={title}
        players={totals.map((t) => ({ ...t, isWinner: t.total === max }))}
        seed={state.sp?.sessionSeed ?? null}
        onPlayAgain={() => {
          if (isBatchPending) return;
          void archiveCurrentGameAndReset();
        }}
        disabled={isBatchPending}
      />
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
      <SpHeaderBar
        handNow={handNow}
        tricksThisRound={tricksThisRound}
        trump={trump}
        trumpCard={trumpCard}
        dealerName={dealerName}
        trumpBroken={!!state.sp?.trumpBroken}
      />

      {/* Surface: Compact Trick Table + Bottom Sheet (overlayed) */}
      <main className="relative flex-1">
        {/* Compact Table */}
        <SpTrickTable
          rotated={rotated}
          playerName={playerName}
          bids={state.rounds[spRoundNo]?.bids ?? {}}
          trickCounts={spTrickCounts}
          playedCards={overlay?.cards ?? null}
          winnerId={reveal ? reveal.winnerId : null}
        />

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
        <SpHandDock
          suitOrder={suitOrder}
          humanBySuit={humanBySuit}
          isPlaying={spPhase === 'playing'}
          isSelected={isSelected}
          canPlayCard={canPlayCard}
          onToggleSelect={(c) =>
            setSelected((prev) => (prev && prev.suit === c.suit && prev.rank === c.rank ? null : c))
          }
          onPlayCard={(c) => void playCard(c)}
        />
      </section>

      {/* Actions Bar */}
      <nav
        className="fixed left-0 right-0 bottom-0 z-30 grid grid-cols-2 gap-2 px-2 py-2 border-t bg-background/85 backdrop-blur"
        style={{ minHeight: 52 }}
        aria-label="Primary actions"
      >
        <>
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
              if (userAdvanceBatch.length === 0) return;
              void appendMany(userAdvanceBatch);
            }}
            disabled={userAdvanceBatch.length === 0}
            aria-disabled={userAdvanceBatch.length === 0}
          >
            {reveal
              ? totalTricksSoFar >= tricksThisRound
                ? isFinalRound
                  ? 'New Game'
                  : 'Next Round'
                : 'Next Hand'
              : 'Continue'}
          </button>
        </>
      </nav>
      {/* No end-of-round confirmation modal */}
    </div>
  );
}
