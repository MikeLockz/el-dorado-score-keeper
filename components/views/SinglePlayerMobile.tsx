'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { events, roundDelta, getCurrentSinglePlayerGameId, singlePlayerPath } from '@/lib/state';
import { computeAdvanceBatch, type Card as SpCard } from '@/lib/single-player';
import { applyRoundAnalyticsFromEvents } from '@/lib/observability/events';
import SpRoundSummary from './sp/SpRoundSummary';
import SpGameSummary from './sp/SpGameSummary';
import SpHeaderBar from './sp/SpHeaderBar';
import SpTrickTable from './sp/SpTrickTable';
import SpHandDock from './sp/SpHandDock';
import { deriveSpCtaMeta } from './sp/cta-state';
import { useSinglePlayerViewModel } from './sp/useSinglePlayerViewModel';

import styles from './single-player-mobile.module.scss';

type Props = {
  humanId: string;
  rng: () => number;
};

export default function SinglePlayerMobile({ humanId, rng }: Props) {
  const {
    state,
    append,
    appendMany,
    isBatchPending,
    height,
    players,
    playerName,
    spPhase,
    spRoundNo,
    spOrder,
    spTrickCounts,
    reveal,
    rotated,
    tableWinnerId,
    tableCards,
    tricksThisRound,
    trump,
    trumpCard,
    dealerName,
    currentBids,
    currentMade,
    humanBid,
    isFinalRound,
    handNow,
    totalTricksSoFar,
    humanBySuit,
    suitOrder,
    userAdvanceBatch,
    canPlayCard,
    playCard,
    onConfirmBid,
    isTrumpBroken,
    summaryEnteredAt,
    trickPlays,
    lastTrickSnapshot,
    sessionSeed,
    scoreCardRounds,
    scoreCardTotals,
    scoreCardGrid,
  } = useSinglePlayerViewModel({ humanId, rng });

  const router = useRouter();
  const gameId = React.useMemo(() => getCurrentSinglePlayerGameId(state), [state]);
  const summaryHref = React.useMemo(
    () => (gameId ? singlePlayerPath(gameId, 'summary') : null),
    [gameId],
  );
  const handleOpenSummary = React.useCallback(() => {
    if (!summaryHref) return;
    router.push(summaryHref);
  }, [router, summaryHref]);

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
    const promise = Promise.resolve(appendMany(userAdvanceBatch));
    promise
      .then(() =>
        applyRoundAnalyticsFromEvents(userAdvanceBatch, {
          mode: 'single-player',
          playerCount: players.length,
          source: 'single-player.advance',
        }),
      )
      .catch(() => {
        setPendingHeight((prev) => (prev === startHeight ? null : prev));
      });
    void promise;
  }, [advanceDisabled, appendMany, height, userAdvanceBatch, players.length]);

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
    <span className={styles.loadingLabel}>
      <Loader2 className={styles.spinner} aria-hidden="true" />
      {loadingLabel}
    </span>
  ) : (
    ctaMeta.label
  );

  const summaryData = React.useMemo(() => {
    const ids = players.map((p) => p.id);
    const totals = ids.map((id) => ({
      id,
      name: playerName(id),
      total: state.scores?.[id] ?? 0,
    }));
    const max =
      totals.length > 0
        ? totals.reduce((m, t) => Math.max(m, t.total), Number.NEGATIVE_INFINITY)
        : 0;
    const title = 'Game Summary';
    return {
      title,
      players: totals.map((t) => ({ ...t, isWinner: t.total === max })),
      seed: sessionSeed,
    };
  }, [players, playerName, state.scores, sessionSeed]);

  // Summary auto-advance hooks (always declared; guarded inside effect)
  const [autoCanceled, setAutoCanceled] = React.useState(false);
  const [remainingMs, setRemainingMs] = React.useState<number>(0);
  React.useEffect(() => {
    if (spPhase !== 'summary') return;
    const autoMs = 10_000;
    const tick = () => {
      const entered = summaryEnteredAt ?? Date.now();
      const elapsed = Date.now() - entered;
      const remaining = Math.max(0, autoMs - elapsed);
      setRemainingMs(remaining);
      if (!autoCanceled && remaining === 0) {
        const batch = computeAdvanceBatch(state, Date.now(), {
          intent: 'auto',
          summaryAutoAdvanceMs: autoMs,
        });
        if (batch.length > 0) {
          void Promise.resolve(appendMany(batch)).then(() =>
            applyRoundAnalyticsFromEvents(batch, {
              mode: 'single-player',
              playerCount: players.length,
              source: 'single-player.summary-auto',
            }),
          );
        }
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state, summaryEnteredAt, spPhase, autoCanceled, appendMany, players.length]);

  // Card selection and play helpers (declare before any returns)
  const [selected, setSelected] = React.useState<SpCard | null>(null);
  const isSelected = (c: SpCard) =>
    !!selected && selected.suit === c.suit && selected.rank === c.rank;

  if (spPhase === 'summary') {
    const ids = players.map((p) => p.id);
    const bidsMap = currentBids;
    const madeMap = currentMade;
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
      const curDealer = state.sp?.dealerId ?? order[0] ?? '';
      const idx = Math.max(0, order.indexOf(curDealer));
      return order[(idx + 1) % order.length] ?? null;
    })();
    const nextLeader = (() => {
      const order = spOrder;
      if (!nextDealer || order.length === 0) return null;
      const idx = Math.max(0, order.indexOf(nextDealer));
      return order[(idx + 1) % order.length] ?? null;
    })();
    const isLastRound = isFinalRound;
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
          if (batch.length > 0)
            void Promise.resolve(appendMany(batch)).then(() =>
              applyRoundAnalyticsFromEvents(batch, {
                mode: 'single-player',
                playerCount: players.length,
                source: 'single-player.summary-continue',
              }),
            );
        }}
        isLastRound={isLastRound}
        disabled={isBatchPending}
        scoreCardRounds={scoreCardRounds}
        scoreCardTotals={scoreCardTotals}
        scoreCardGrid={scoreCardGrid}
      />
    );
  }

  // Game Summary Screen (phase === 'game-summary')
  if (spPhase === 'game-summary' || spPhase === 'done') {
    return (
      <SpGameSummary
        title={summaryData.title}
        players={summaryData.players}
        seed={summaryData.seed}
        scoreCardRounds={scoreCardRounds}
        scoreCardTotals={scoreCardTotals}
        scoreCardGrid={scoreCardGrid}
      />
    );
  }

  return (
    <div className={styles.root}>
      <SpHeaderBar
        handNow={handNow}
        tricksThisRound={tricksThisRound}
        trump={trump}
        trumpCard={trumpCard}
        dealerName={dealerName}
        trumpBroken={isTrumpBroken}
      />

      {/* Surface: Compact Trick Table */}
      <main className={styles.tableSurface}>
        {/* Compact Table */}
        <SpTrickTable
          rotated={rotated}
          playerName={playerName}
          bids={currentBids}
          trickCounts={spTrickCounts}
          playedCards={tableCards}
          winnerId={tableWinnerId}
        />
      </main>

      {/* Last Trick banner (after clear, before next trick starts) */}
      {(() => {
        const snap = lastTrickSnapshot;
        const trickIdle = trickPlays.length === 0;
        if (!snap || reveal || !trickIdle) return null;
        return (
          <div className={styles.overlayMessage}>
            <span className={styles.overlayLabel}>Last Trick:</span>{' '}
            <span>{playerName(snap.winnerId)}</span>
          </div>
        );
      })()}

      {/* Hand Dock */}
      <section className={styles.handDockShell} aria-label="Your hand">
        {spPhase === 'bidding' && (
          <div className={styles.bidBar}>
            <span>Your bid</span>
            <button
              type="button"
              className={styles.bidButton}
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
            <span className={styles.bidValue}>{humanBid}</span>
            <button
              type="button"
              className={styles.bidButton}
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
              className={styles.bidConfirm}
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
          onPlayCard={(c) => {
            if (!canPlayCard(c)) return;
            setSelected(null);
            void playCard(c);
          }}
        />
      </section>

      {/* Actions Bar */}
      <nav className={styles.actionsBar} aria-label="Primary actions">
        <>
          <button
            type="button"
            className={styles.detailsButton}
            onClick={handleOpenSummary}
            disabled={!summaryHref}
            aria-label="Round details"
          >
            Details
          </button>
          <button
            className={styles.primaryButton}
            onClick={onAdvance}
            disabled={advanceDisabled}
            aria-disabled={advanceDisabled}
          >
            {advanceLabel}
          </button>
        </>
      </nav>
      {/* No end-of-round confirmation modal */}
    </div>
  );
}
