'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

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
} from '@/lib/state';
import {
  roundDelta,
  selectCumulativeScoresAllRounds,
  type AppEvent,
  ROUNDS_TOTAL,
} from '@/lib/state';
import { bots, computeAdvanceBatch, type Card as SpCard } from '@/lib/single-player';
import { canPlayCard as ruleCanPlayCard } from '@/lib/rules/sp';
import { useNewGameRequest } from '@/lib/game-flow';
import SpRoundSummary from './sp/SpRoundSummary';
import SpGameSummary from './sp/SpGameSummary';
import SpTrickTable from './sp/SpTrickTable';
import SpHandDock from './sp/SpHandDock';
import { CardGlyph } from '@/components/ui';
import { deriveSpCtaMeta } from './sp/cta-state';

type Props = {
  humanId: string;
  rng: () => number;
};

export default function SinglePlayerDesktop({ humanId, rng }: Props) {
  const { state, append, appendMany, isBatchPending, height } = useAppState();
  const { startNewGame, pending: newGamePending } = useNewGameRequest({ requireIdle: true });
  const players = selectPlayersOrderedFor(state, 'single');
  const isDev = typeof process !== 'undefined' ? process.env?.NODE_ENV !== 'production' : false;
  const playerName = (pid: string) =>
    players.find((p) => p.id === pid)?.name ?? (isDev ? pid : 'Unknown');
  const playerLabel = (pid: string) => {
    const name = playerName(pid);
    return pid === humanId ? `${name} (you)` : name;
  };

  const sp = state.sp;
  const spPhase = sp?.phase ?? 'setup';
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
  const tricksThisRound = selectSpTricksForRound(state);
  const { trump, trumpCard } = selectSpTrumpInfo(state);
  const dealerName = selectSpDealerName(state);

  const totalsByRound = React.useMemo(() => selectCumulativeScoresAllRounds(state), [state]);
  const roundTotals = totalsByRound[spRoundNo] ?? {};
  const rd = state.rounds[spRoundNo];
  const humanBid = rd?.bids?.[humanId] ?? 0;
  const isFinalRound = spRoundNo >= ROUNDS_TOTAL;

  const handsCompleted = Object.values(spTrickCounts ?? {}).reduce((a, n) => a + (n ?? 0), 0);
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
  const userAdvanceBatch = React.useMemo(
    () => computeAdvanceBatch(state, Date.now(), { intent: 'user' }),
    [state],
  );

  const ctaMeta = React.useMemo(
    () =>
      deriveSpCtaMeta(userAdvanceBatch, {
        totalTricksSoFar,
        tricksThisRound,
        isFinalRound,
      }),
    [userAdvanceBatch, totalTricksSoFar, tricksThisRound, isFinalRound],
  );

  const [pendingHeight, setPendingHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (pendingHeight == null) return;
    if (height > pendingHeight) setPendingHeight(null);
  }, [height, pendingHeight]);

  const isProcessingAdvance = pendingHeight != null;

  const advanceDisabled =
    userAdvanceBatch.length === 0 || ctaMeta.autoWait || isBatchPending || isProcessingAdvance;

  const onAdvance = React.useCallback(() => {
    if (advanceDisabled) return;
    const startHeight = height;
    setPendingHeight(startHeight);
    void appendMany(userAdvanceBatch).catch(() => {
      setPendingHeight((prev) => (prev === startHeight ? null : prev));
    });
  }, [advanceDisabled, appendMany, height, userAdvanceBatch]);

  const loadingLabel = React.useMemo(() => {
    switch (ctaMeta.stage) {
      case 'next-hand':
        return 'Loading next hand...';
      case 'next-round':
        return 'Loading next round...';
      case 'new-game':
        return 'Preparing new game...';
      default:
        return 'Loading...';
    }
  }, [ctaMeta.stage]);

  const advanceLabel = isProcessingAdvance ? (
    <span className="flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {loadingLabel}
    </span>
  ) : (
    ctaMeta.label
  );

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
            tricksThisRound,
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

  if (spPhase === 'summary') {
    const ids = players.map((p) => p.id);
    const bidsMap = (state.rounds[spRoundNo]?.bids ?? {}) as Record<string, number | undefined>;
    const madeMap = (state.rounds[spRoundNo]?.made ?? {}) as Record<
      string,
      boolean | null | undefined
    >;
    const perPlayer = ids.map((id) => {
      const name = playerLabel(id);
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
      <div className="min-h-dvh bg-background text-foreground">
        <SpRoundSummary
          roundNo={spRoundNo}
          trump={trump}
          dealerName={dealerName}
          nextLeaderName={nextLeader ? playerLabel(nextLeader) : null}
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
      </div>
    );
  }

  if (spPhase === 'game-summary' || spPhase === 'done') {
    const ids = players.map((p) => p.id);
    const totals = ids.map((id) => ({ id, name: playerLabel(id), total: state.scores?.[id] ?? 0 }));
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
          if (isBatchPending || newGamePending) return;
          void startNewGame({ skipConfirm: true });
        }}
        disabled={isBatchPending || newGamePending}
      />
    );
  }
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b bg-card/95 px-8 py-4 shadow-sm">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Single Player</h1>
            <p className="text-sm text-muted-foreground">
              Round {spRoundNo + 1} · {tricksThisRound} tricks
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex flex-col">
              <span className="text-xs uppercase text-muted-foreground">Hand</span>
              <span className="font-semibold tabular-nums">
                {handNow}/{tricksThisRound}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs uppercase text-muted-foreground">Trump</span>
              <span className="flex items-center gap-2">
                {trump && trumpCard ? (
                  <CardGlyph suit={trump} rank={trumpCard.rank} size="md" padded />
                ) : (
                  '—'
                )}
                <span className="text-xs text-muted-foreground">
                  Broken: {state.sp?.trumpBroken ? 'Yes' : 'No'}
                </span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs uppercase text-muted-foreground">Dealer</span>
              <span>{dealerName ?? '—'}</span>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-[1200px] flex-1 flex-col gap-6 px-8 py-6">
        <div className="grid grid-cols-[minmax(260px,320px)_minmax(0,1fr)] gap-6">
          <aside
            className="flex h-full flex-col rounded-lg border bg-card shadow-sm"
            aria-label="Round overview"
          >
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Round Overview
              </h2>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
              <section>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Bids</h3>
                <dl className="mt-2 space-y-2 text-sm">
                  {spOrder.map((pid) => (
                    <div key={`bid-${pid}`} className="flex items-center justify-between gap-3">
                      <dt className="truncate font-medium">{playerLabel(pid)}</dt>
                      <dd className="tabular-nums text-right">
                        {state.rounds[spRoundNo]?.bids?.[pid] ?? 0}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  Round Scores
                </h3>
                <dl className="mt-2 space-y-2 text-sm">
                  {spOrder.map((pid) => (
                    <div key={`score-${pid}`} className="flex items-center justify-between gap-3">
                      <dt className="truncate font-medium">{playerLabel(pid)}</dt>
                      <dd className="tabular-nums text-right">{roundTotals[pid] ?? 0}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tricks won</span>
                  <span className="tabular-nums font-semibold">{totalTricksSoFar}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Current state</span>
                  <span className="capitalize">{spPhase}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Dealer next</span>
                  <span>
                    {(() => {
                      const cur = sp?.dealerId ?? spOrder[0] ?? null;
                      if (!cur || spOrder.length === 0) return '—';
                      const idx = Math.max(0, spOrder.indexOf(cur));
                      if (spOrder.length === 1) return playerLabel(cur);
                      const next = spOrder[(idx + 1) % spOrder.length];
                      return next ? playerLabel(next) : playerLabel(cur);
                    })()}
                  </span>
                </div>
              </section>
              <section className="space-y-3">
                <button
                  type="button"
                  className="w-full rounded border px-3 py-2 text-sm hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
                  onClick={() =>
                    void append(events.spTrumpBrokenSet({ broken: !state.sp?.trumpBroken }))
                  }
                >
                  {state.sp?.trumpBroken ? 'Unmark Trump Broken' : 'Mark Trump Broken'}
                </button>
                {state.sp?.reveal && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">Hand winner:</span>{' '}
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                      {playerLabel(state.sp.reveal.winnerId)}
                    </span>
                  </div>
                )}
              </section>
            </div>
          </aside>
          <section className="flex flex-col gap-6">
            <div className="rounded-lg border bg-card shadow-sm">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Current Trick
                </h2>
              </div>
              <div className="max-h-[50vh] overflow-auto px-4 py-4 [&>section]:space-y-3 [&>section]:p-0 [&>section]:pb-4">
                <SpTrickTable
                  rotated={rotated}
                  playerName={playerLabel}
                  bids={state.rounds[spRoundNo]?.bids ?? {}}
                  trickCounts={spTrickCounts}
                  playedCards={overlay?.cards ?? null}
                  winnerId={reveal ? reveal.winnerId : null}
                />
              </div>
            </div>
            <div className="rounded-lg border bg-card shadow-sm" aria-label="Play controls">
              {spPhase === 'bidding' && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Your bid</span>
                    <span className="font-semibold tabular-nums">{humanBid}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="h-8 w-8 rounded border bg-sky-700 text-white hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500"
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
                    <button
                      type="button"
                      className="h-8 w-8 rounded border bg-sky-700 text-white hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500"
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
                      className="ml-2 rounded bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void onConfirmBid(humanBid)}
                      disabled={isBatchPending}
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              )}
              <div className="px-2 pb-2">
                <SpHandDock
                  suitOrder={suitOrder}
                  humanBySuit={humanBySuit}
                  isPlaying={spPhase === 'playing'}
                  isSelected={isSelected}
                  canPlayCard={canPlayCard}
                  onToggleSelect={(c) =>
                    setSelected((prev) =>
                      prev && prev.suit === c.suit && prev.rank === c.rank ? null : c,
                    )
                  }
                  onPlayCard={(c) => void playCard(c)}
                />
              </div>
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3"
                aria-label="Turn actions"
              >
                <div className="text-sm text-muted-foreground">
                  {reveal
                    ? totalTricksSoFar >= tricksThisRound
                      ? isFinalRound
                        ? 'Round complete — start a new game when ready.'
                        : 'Round complete — continue to the next round.'
                      : 'Hand resolved — continue when ready.'
                    : spPhase === 'bidding'
                      ? 'Adjust your bid, then confirm.'
                      : 'Play a card or continue.'}
                </div>
                <button
                  type="button"
                  className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={onAdvance}
                  disabled={advanceDisabled}
                  aria-disabled={advanceDisabled}
                >
                  {advanceLabel}
                </button>
              </div>
            </div>
          </section>
        </div>
        {(() => {
          const snap = sp?.lastTrickSnapshot ?? null;
          const trickIdle = (sp?.trickPlays?.length ?? 0) === 0;
          if (!snap || reveal || !trickIdle) return null;
          return (
            <div className="rounded-lg border bg-card px-4 py-3 text-sm shadow-sm">
              <span className="text-muted-foreground">Last trick:</span>{' '}
              <span className="font-semibold">{playerLabel(snap.winnerId)}</span>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
