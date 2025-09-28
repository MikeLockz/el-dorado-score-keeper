'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

import { events, roundDelta } from '@/lib/state';
import { computeAdvanceBatch, type Card as SpCard } from '@/lib/single-player';
import SpRoundSummary from './sp/SpRoundSummary';
import SpGameSummary from './sp/SpGameSummary';
import SpTrickTable from './sp/SpTrickTable';
import SpHandDock from './sp/SpHandDock';
import { CardGlyph } from '@/components/ui';
import { deriveSpCtaMeta } from './sp/cta-state';
import { useSinglePlayerViewModel } from './sp/useSinglePlayerViewModel';

import styles from './single-player-desktop.module.scss';

type Props = {
  humanId: string;
  rng: () => number;
};

export default function SinglePlayerDesktop({ humanId, rng }: Props) {
  const {
    state,
    append,
    appendMany,
    isBatchPending,
    height,
    players,
    playerName,
    playerLabel,
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
    roundTotals,
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
    <span className={styles.loadingLabel}>
      <Loader2 className={styles.spinner} aria-hidden="true" />
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
      const entered = summaryEnteredAt ?? Date.now();
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
  }, [state, summaryEnteredAt, spPhase, autoCanceled, appendMany]);

  const [selected, setSelected] = React.useState<SpCard | null>(null);
  const isSelected = (c: SpCard) =>
    !!selected && selected.suit === c.suit && selected.rank === c.rank;

  const playSelectedCard = React.useCallback(
    (card: SpCard) => {
      if (!canPlayCard(card)) return;
      setSelected(null);
      void playCard(card);
    },
    [canPlayCard, playCard],
  );

  const summaryData = React.useMemo(() => {
    const ids = players.map((p) => p.id);
    const totals = ids.map((id) => ({
      id,
      name: playerLabel(id),
      total: state.scores?.[id] ?? 0,
    }));
    const totalsValues = totals.map((t) => t.total);
    const max = totalsValues.length > 0 ? Math.max(...totalsValues) : 0;
    const winners = totals.filter((t) => t.total === max).map((t) => t.name);
    const title =
      winners.length > 1
        ? `Winners: ${winners.join(', ')}`
        : winners.length === 1
          ? `Winner: ${winners[0] ?? '-'}`
          : 'Game Summary';
    return {
      title,
      players: totals.map((t) => ({ ...t, isWinner: totalsValues.length > 0 && t.total === max })),
      seed: sessionSeed,
    };
  }, [players, playerLabel, state.scores, sessionSeed]);

  const [showSummary, setShowSummary] = React.useState(false);
  React.useEffect(() => {
    if (spPhase === 'bidding' || spPhase === 'playing') return;
    setShowSummary(false);
  }, [spPhase]);

  const toggleSummaryView = React.useCallback(() => {
    setShowSummary((prev) => !prev);
  }, []);

  if (spPhase === 'summary') {
    const ids = players.map((p) => p.id);
    const perPlayer = ids.map((id) => {
      const name = playerLabel(id);
      const bid = currentBids[id] ?? null;
      const made = currentMade[id] ?? null;
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
    return (
      <div className={styles.summaryShell}>
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
            if (userAdvanceBatch.length > 0) void appendMany(userAdvanceBatch);
          }}
          isLastRound={isFinalRound}
          disabled={isBatchPending}
          scoreCardRounds={scoreCardRounds}
          scoreCardTotals={scoreCardTotals}
          scoreCardGrid={scoreCardGrid}
        />
      </div>
    );
  }

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
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerTitleGroup}>
            <h1 className={styles.headerTitle}>Single Player</h1>
            <p className={styles.headerSubtitle}>
              Round {spRoundNo + 1} · {tricksThisRound} tricks
            </p>
          </div>
          <div className={styles.headerStats}>
            <div className={styles.headerStat}>
              <span className={styles.headerStatLabel}>Hand</span>
              <span className={styles.headerStatValue}>
                {handNow}/{tricksThisRound}
              </span>
            </div>
            <div className={styles.headerStat}>
              <span className={styles.headerStatLabel}>Trump</span>
              <span className={styles.headerTrumpValue}>
                {trump && trumpCard ? (
                  <CardGlyph suit={trump} rank={trumpCard.rank} size="md" padded />
                ) : (
                  '—'
                )}
                <span className={styles.headerTrumpMeta}>
                  Broken: {isTrumpBroken ? 'Yes' : 'No'}
                </span>
              </span>
            </div>
            <div className={styles.headerStat}>
              <span className={styles.headerStatLabel}>Dealer</span>
              <span className={styles.headerStatValue}>{dealerName ?? '—'}</span>
            </div>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.contentGrid}>
          <aside className={styles.sidebar} aria-label="Round overview">
            <div className={styles.sidebarHeader}>
              <h2 className={styles.sidebarHeading}>Round Overview</h2>
            </div>
            <div className={styles.sidebarBody}>
              <section className={styles.sidebarSection}>
                <h3 className={styles.sidebarSectionHeading}>Bids</h3>
                <dl className={styles.sidebarList}>
                  {spOrder.map((pid) => (
                    <div key={`bid-${pid}`} className={styles.sidebarRow}>
                      <dt className={styles.sidebarRowLabel}>{playerLabel(pid)}</dt>
                      <dd className={styles.sidebarRowValue}>{currentBids[pid] ?? 0}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className={styles.sidebarSection}>
                <h3 className={styles.sidebarSectionHeading}>Round Scores</h3>
                <dl className={styles.sidebarList}>
                  {spOrder.map((pid) => (
                    <div key={`score-${pid}`} className={styles.sidebarRow}>
                      <dt className={styles.sidebarRowLabel}>{playerLabel(pid)}</dt>
                      <dd className={styles.sidebarRowValue}>{roundTotals[pid] ?? 0}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className={styles.sidebarMeta}>
                <div className={styles.sidebarMetaRow}>
                  <span className={styles.sidebarMetaLabel}>Tricks won</span>
                  <span className={styles.sidebarMetaValue}>{totalTricksSoFar}</span>
                </div>
                <div className={styles.sidebarMetaRow}>
                  <span className={styles.sidebarMetaLabel}>Current state</span>
                  <span className={styles.sidebarMetaValue} style={{ textTransform: 'capitalize' }}>
                    {spPhase}
                  </span>
                </div>
                <div className={styles.sidebarMetaRow}>
                  <span className={styles.sidebarMetaLabel}>Dealer next</span>
                  <span className={styles.sidebarMetaValue}>
                    {(() => {
                      const cur = state.sp?.dealerId ?? spOrder[0] ?? null;
                      if (!cur || spOrder.length === 0) return '—';
                      const idx = Math.max(0, spOrder.indexOf(cur));
                      if (spOrder.length === 1) return playerName(cur);
                      const next = spOrder[(idx + 1) % spOrder.length];
                      return next ? playerName(next) : playerName(cur);
                    })()}
                  </span>
                </div>
              </section>
              <section className={styles.sidebarStatusSection}>
                <div className={styles.sidebarStatusCard}>
                  <span>Trump broken</span>
                  <span className={styles.sidebarStatusValue}>{isTrumpBroken ? 'Yes' : 'No'}</span>
                </div>
                {reveal && (
                  <div role="status" aria-live="polite" className={styles.sidebarReveal}>
                    <span className={styles.sidebarRevealLabel}>Hand winner:</span>
                    <span className={styles.sidebarRevealValue}>{playerLabel(reveal.winnerId)}</span>
                  </div>
                )}
              </section>
              <div className={styles.sidebarFooter}>
                <button
                  type="button"
                  className={styles.summaryToggle}
                  onClick={toggleSummaryView}
                  aria-pressed={showSummary}
                  aria-expanded={showSummary}
                  aria-controls="sp-game-summary-panel"
                >
                  View Full Summary
                </button>
              </div>
            </div>
          </aside>
          <section className={styles.mainColumn}>
            {showSummary ? (
              <div
                id="sp-game-summary-panel"
                className={styles.summaryPanel}
                aria-label="Full game summary"
              >
                <SpGameSummary
                  variant="panel"
                  title={summaryData.title}
                  players={summaryData.players}
                  seed={summaryData.seed}
                  onClose={() => setShowSummary(false)}
                  scoreCardRounds={scoreCardRounds}
                  scoreCardTotals={scoreCardTotals}
                  scoreCardGrid={scoreCardGrid}
                />
              </div>
            ) : (
              <>
                <div className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <h2 className={styles.panelHeading}>Current Trick</h2>
                  </div>
                  <div className={styles.trickPanelBody}>
                    <SpTrickTable
                      rotated={rotated}
                      playerName={playerLabel}
                      bids={currentBids}
                      trickCounts={spTrickCounts}
                      playedCards={tableCards}
                      winnerId={tableWinnerId}
                    />
                  </div>
                </div>
                <div className={styles.panel} aria-label="Play controls">
                  {spPhase === 'bidding' && (
                    <div className={styles.bidControls}>
                      <div className={styles.bidSummary}>
                        <span className={styles.sidebarMetaLabel}>Your bid</span>
                        <span className={styles.bidSummaryValue}>{humanBid}</span>
                      </div>
                      <div className={styles.bidButtons}>
                        <button
                          type="button"
                          className={styles.bidAdjustButton}
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
                          className={styles.bidAdjustButton}
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
                          className={styles.confirmBidButton}
                          onClick={() => void onConfirmBid(humanBid)}
                          disabled={isBatchPending}
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  )}
                  <div className={styles.handDockRegion}>
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
                      onPlayCard={playSelectedCard}
                    />
                  </div>
                  <div className={styles.actionsRow} aria-label="Turn actions">
                    <div className={styles.actionsMessage}>
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
                      className={styles.primaryActionButton}
                      onClick={onAdvance}
                      disabled={advanceDisabled}
                      aria-disabled={advanceDisabled}
                    >
                      {advanceLabel}
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
        {!showSummary &&
          (() => {
            const snap = lastTrickSnapshot;
            const trickIdle = trickPlays.length === 0;
            if (!snap || reveal || !trickIdle) return null;
            return (
              <div className={styles.lastTrickBanner}>
                <span className={styles.lastTrickLabel}>Last trick:</span>{' '}
                <span className={styles.sidebarStatusValue}>{playerLabel(snap.winnerId)}</span>
              </div>
            );
          })()}
      </main>
    </div>
  );
}
