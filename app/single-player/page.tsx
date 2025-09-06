"use client";
import React from 'react';
import { startRound, bots, winnerOfTrick } from '@/lib/single-player';
import CurrentGame from '@/components/views/CurrentGame';
import type { PlayerId, Card } from '@/lib/single-player';
import { useAppState } from '@/components/state-provider';
import { tricksForRound } from '@/lib/state/logic';
import {
  selectPlayersOrdered,
  events,
  archiveCurrentGameAndReset,
  selectSpNextToPlay,
  selectSpLiveOverlay,
  selectSpTrumpInfo,
  selectSpDealerName,
  selectSpTricksForRound,
  selectSpHandBySuit,
  selectSpIsRoundDone,
} from '@/lib/state';

export default function SinglePlayerPage() {
  const { state, append, appendMany, ready } = useAppState();
  const [playersCount, setPlayersCount] = React.useState(4);
  const [dealerIdx, setDealerIdx] = React.useState(0);
  const [humanIdx, setHumanIdx] = React.useState(0);
  const [roundNo, setRoundNo] = React.useState(1);
  const trickLeader = (state.sp.leaderId as PlayerId | null) ?? null;
  const [saved, setSaved] = React.useState(false);
  const [selectedCard, setSelectedCard] = React.useState<Card | null>(null);
  const [initializedScoring, setInitializedScoring] = React.useState(false);
  const [autoDealt, setAutoDealt] = React.useState(false);

  const appPlayers = React.useMemo(() => selectPlayersOrdered(state), [state]);
  const activePlayers = React.useMemo(() => appPlayers.slice(0, playersCount), [appPlayers, playersCount]);
  const players = React.useMemo(() => activePlayers.map((p) => p.id), [activePlayers]);
  const dealer = players[dealerIdx] ?? players[0]!;
  const human = players[humanIdx] ?? players[0]!;
  const tricks = selectSpTricksForRound(state);
  const useTwoDecks = playersCount > 5;
  const sp = state.sp;
  const phase = sp.phase;
  const spTrump = sp.trump;
  const spTrumpCard = sp.trumpCard;
  const spOrder = sp.order;
  const spHands = sp.hands as Record<PlayerId, Card[]>;
  const spTrickPlays = (sp.trickPlays ?? []).map((p, i) => ({ player: p.playerId as PlayerId, card: p.card as any as Card, order: i }));
  const spTrickCounts = sp.trickCounts as Record<PlayerId, number>;
  const spTrumpBroken = sp.trumpBroken;

  const onDeal = async () => {
    setSaved(false);
    setSelectedCard(null);
    // On first deal for this session, archive current game and reset scoring roster
    if (!initializedScoring) {
      const desired = activePlayers.map((p) => ({ id: p.id, name: p.name }));
      try {
        await archiveCurrentGameAndReset();
      } catch (e) {
        console.warn('Failed to archive current game; continuing with reset roster step', e);
      }
      // Remove any existing players (best-effort; reducer ignores unknown IDs)
      const existingIds = Object.keys(state.players || {});
      for (const id of existingIds) {
        try {
          await append(events.playerRemoved({ id }));
        } catch {}
      }
      // Add desired players in order, ensuring names match
      for (const p of desired) {
        try {
          await append(events.playerAdded({ id: p.id, name: p.name }));
        } catch {}
      }
      // Explicitly set display order to desired order
      try {
        await append(events.playersReordered({ order: desired.map((d) => d.id) }));
      } catch {}
      setInitializedScoring(true);
    }
    const deal = startRound(
      {
        round: roundNo,
        players,
        dealer,
        tricks,
        useTwoDecks,
      },
      Date.now(),
    );
    // Persist deal + leader + set current scoring round to bidding atomically
    try {
      await appendMany([
        events.spDeal({
          roundNo: roundNo,
          dealerId: dealer,
          order: deal.order,
          trump: deal.trump,
          trumpCard: { suit: deal.trumpCard.suit as any, rank: deal.trumpCard.rank as any },
          hands: deal.hands as any,
        }),
        events.spLeaderSet({ leaderId: deal.firstToAct }),
        events.roundStateSet({ round: roundNo, state: 'bidding' }),
      ]);
    } catch (e) {
      console.warn('Failed to persist deal', e);
    }
  };

  // Auto-deal when starting a new single-player game
  React.useEffect(() => {
    if (!ready) return;
    if (phase !== 'setup') return;
    if (autoDealt) return;
    // Ensure we have enough players in the scorekeeper to fill seats
    if (activePlayers.length < playersCount) return;
    setAutoDealt(true);
    void onDeal();
  }, [ready, phase, autoDealt, activePlayers.length, playersCount]);

  // Removed: localStorage snapshot/restore – now fully store-driven

  const humanBySuit = selectSpHandBySuit(state, human);
  const isRoundDone = selectSpIsRoundDone(state);

  // Formatting helpers for card display
  const rankLabel = React.useCallback((rank: number): string => {
    if (rank === 14) return 'A';
    if (rank === 13) return 'K';
    if (rank === 12) return 'Q';
    if (rank === 11) return 'J';
    return String(rank);
  }, []);
  const suitSymbol = React.useCallback((suit: string): string => {
    return suit === 'spades' ? '♠' : suit === 'hearts' ? '♥' : suit === 'diamonds' ? '♦' : '♣';
  }, []);
  const suitColorClass = React.useCallback((suit: string): string => {
    // Hearts/Diamonds in red; Clubs/Spades default foreground
    return suit === 'hearts' || suit === 'diamonds'
      ? 'text-red-700 dark:text-red-300'
      : 'text-foreground';
  }, []);
  const suitOrder = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
  const nameFor = React.useCallback(
    (pid: string) => activePlayers.find((ap) => ap.id === pid)?.name ?? pid,
    [activePlayers],
  );
  const BotBadge = () => (
    <span className="ml-1 text-[10px] uppercase rounded px-1 border border-border text-muted-foreground">BOT</span>
  );

  // Advance play: bot turns and trick resolution
  React.useEffect(() => {
    if (!spTrump || phase !== 'playing' || !trickLeader) return;
    const nextToPlay = selectSpNextToPlay(state);
    if (!nextToPlay) return;
    // If trick complete
    if (spTrickPlays.length === spOrder.length) return; // handled in another effect
    // If it's a bot, play automatically
    if (nextToPlay !== human) {
      const pid = nextToPlay;
      const botHand = spHands[pid] ?? [];
      // Build context and let bot choose
      const card = bots.botPlay(
        {
          trump: spTrump!,
          trickPlays: spTrickPlays as any,
          hand: botHand,
          tricksThisRound: tricks,
          seatIndex: spOrder.findIndex((p) => p === pid),
          bidsSoFar: (state.rounds[roundNo]?.bids ?? {}) as any,
          tricksWonSoFar: spTrickCounts as any,
          selfId: pid,
          trumpBroken: spTrumpBroken,
        },
        'normal',
      );
      // Slight delay for UX
      const t = setTimeout(() => {
        // Persist to store (batched for uniformity)
        void appendMany([
          events.spTrickPlayed({
            playerId: pid,
            card: { suit: card.suit as any, rank: card.rank },
          }),
        ]);
      }, 250);
      return () => clearTimeout(t);
    }
  }, [phase, spTrickPlays, trickLeader, spHands, human, tricks, spOrder, spTrump, spTrumpBroken, spTrickCounts, roundNo, state.rounds]);

  // Auto-bid for bots during bidding phase (store-driven)
  React.useEffect(() => {
    if (phase !== 'bidding') return;
    const bidsMap = (state.rounds[roundNo]?.bids ?? {}) as Record<string, number | undefined>;
    // Only proceed if human has bid
    if (bidsMap[human] == null) return;
    // Find the next bot without a bid
    const nextBot = spOrder.find((pid) => pid !== human && bidsMap[pid] == null);
    if (!nextBot) {
      // All bids present -> advance to playing
      const t = setTimeout(() => {
        void appendMany([
          events.roundStateSet({ round: roundNo, state: 'playing' }),
          events.spPhaseSet({ phase: 'playing' }),
        ]);
      }, 0);
      return () => clearTimeout(t);
    }
    const amount = bots.botBid(
      {
        trump: spTrump!,
        hand: spHands[nextBot] ?? [],
        tricksThisRound: tricks,
        seatIndex: spOrder.findIndex((p) => p === nextBot),
        bidsSoFar: bidsMap as any,
        selfId: nextBot,
      },
      'normal',
    );
    const t = setTimeout(() => {
      void append(events.bidSet({ round: roundNo, playerId: nextBot, bid: amount }));
    }, 250);
    return () => clearTimeout(t);
  }, [phase, spOrder, human, spTrump, spHands, roundNo, tricks, state.rounds]);

  // Resolve completed trick
  React.useEffect(() => {
    if (!spTrump || phase !== 'playing' || !trickLeader) return;
    if (spTrickPlays.length < spOrder.length) return;
    // Determine winner
    const winner = winnerOfTrick(spTrickPlays as any, spTrump!);
    if (!winner) return;
    const t = setTimeout(() => {
      // If any off-suit trump was played this trick, mark trump as broken for future leads
      const ledSuit = spTrickPlays[0]?.card.suit as any;
      const anyTrump = spTrickPlays.some((p) => (p.card as any).suit === spTrump);
      const batch: any[] = [];
      if (!spTrumpBroken && anyTrump && ledSuit && ledSuit !== spTrump) {
        batch.push(events.spTrumpBrokenSet({ broken: true }));
      }
      batch.push(events.spTrickCleared({ winnerId: winner }));
      batch.push(events.spLeaderSet({ leaderId: winner }));
      void appendMany(batch);
    }, 800); // leave the full trick visible a bit longer
    return () => clearTimeout(t);
  }, [spTrickPlays, spOrder.length, spTrump, phase, trickLeader, spTrumpBroken]);

  // Auto-sync results to scorekeeper when round ends
  React.useEffect(() => {
    if (!isRoundDone) return;
    if (saved) return; // already synced
    (async () => {
      try {
        const batch: any[] = [];
        const bidsMap = (state.rounds[roundNo]?.bids ?? {}) as Record<string, number | undefined>;
        for (const pid of players) {
          const won = spTrickCounts[pid] ?? 0;
          const made = won === (bidsMap[pid] ?? 0);
          batch.push(events.madeSet({ round: roundNo, playerId: pid, made }));
        }
        // Mark SP phase as done and finalize scoring row in the same batch
        batch.push(events.spPhaseSet({ phase: 'done' }));
        batch.push(events.roundFinalize({ round: roundNo }));

        // Auto-advance: prepare next round deal (if any) and include in the same batch
        if (roundNo < 10) {
          const nextRound = Math.min(10, roundNo + 1);
          const nextDealerIdx = (dealerIdx + 1) % players.length;
          const nextDealer = players[nextDealerIdx]!;
          const nextTricks = tricksForRound(nextRound);
          const useTwoDecks = playersCount > 5;
          const deal = startRound(
            {
              round: nextRound,
              players,
              dealer: nextDealer,
              tricks: nextTricks,
              useTwoDecks,
            },
            Date.now(),
          );
          batch.push(
            events.spDeal({
              roundNo: nextRound,
              dealerId: nextDealer,
              order: deal.order,
              trump: deal.trump,
              trumpCard: { suit: deal.trumpCard.suit as any, rank: deal.trumpCard.rank as any },
              hands: deal.hands as any,
            }),
          );
          batch.push(events.spLeaderSet({ leaderId: deal.firstToAct }));
          batch.push(events.spPhaseSet({ phase: 'bidding' }));
          batch.push(events.roundStateSet({ round: nextRound, state: 'bidding' }));
          await appendMany(batch);
          // reflect UI local indices to keep controls coherent
          setDealerIdx(nextDealerIdx);
          setRoundNo(nextRound);
        } else {
          await appendMany(batch);
          // For the final round, make previous round (round 9) active for bidding and keep this round scored
          try {
            await append(events.roundStateSet({ round: 9, state: 'bidding' }));
          } catch (e) {
            console.warn('failed to set round 9 to bidding after round 10 scored', e);
          }
        }
        setSaved(true);
      } catch (e) {
        console.warn('Failed to auto-sync results', e);
      }
    })();
  }, [isRoundDone, players, roundNo, append, saved, spTrickCounts, state.rounds]);

  return (
    <main className="p-4 space-y-6">
      <h1 className="text-xl font-bold">El Dorado — Single Player (Dev Harness)</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Players</label>
          <input
            className="border rounded px-2 py-1 w-24"
            type="number"
            min={2}
            max={10}
            value={playersCount}
            onChange={(e) => setPlayersCount(Math.max(2, Math.min(10, Number(e.target.value) || 0)))}
          />
          <div className="text-xs text-muted-foreground">{useTwoDecks ? 'Using two decks' : 'Using one deck'}</div>
          <div className="text-xs text-muted-foreground">Available players in scorekeeper: {appPlayers.length}</div>
          {appPlayers.length < playersCount && (
            <div className="text-xs text-red-600">Add more players on Players page to reach {playersCount}.</div>
          )}
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Round</label>
          <input
            className="border rounded px-2 py-1 w-24"
            type="number"
            min={1}
            max={10}
            value={roundNo}
            onChange={(e) => setRoundNo(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
          />
          <div className="text-xs text-muted-foreground">Tricks this round: {tricks}</div>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Dealer Seat</label>
          <select
            className="border rounded px-2 py-1"
            value={dealerIdx}
            onChange={(e) => setDealerIdx(Number(e.target.value))}
          >
            {activePlayers.map((p, i) => (
              <option key={p.id} value={i}>{`${p.name}`}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Human Seat</label>
          <select
            className="border rounded px-2 py-1"
            value={humanIdx}
            onChange={(e) => setHumanIdx(Number(e.target.value))}
          >
            {activePlayers.map((p, i) => (
              <option key={p.id} value={i}>{`${p.name}`}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        className="inline-flex items-center rounded border px-3 py-1 text-sm"
        type="button"
        onClick={onDeal}
      >
        Deal Round
      </button>

      {spOrder.length > 0 && (
        <div className="space-y-2">
          {(() => {
            const info = selectSpTrumpInfo(state);
            return (
              <div className="text-sm">
                Trump:{' '}
                <span
                  className="font-mono text-lg inline-flex items-center gap-1"
                  title={info.trumpCard ? `Trump card: ${rankLabel(info.trumpCard.rank)} of ${info.trumpCard.suit}` : undefined}
                >
                  {info.trump && info.trumpCard ? (
                    <>
                      <span className="font-bold text-foreground">{rankLabel(info.trumpCard.rank)}</span>
                      <span className={suitColorClass(info.trump)}>{suitSymbol(info.trump)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
              </div>
            );
          })()}
          {(() => {
            const dealerName = selectSpDealerName(state);
            return (
              <div className="text-sm">Dealer: <span className="font-mono">{dealerName ?? '-'}</span></div>
            );
          })()}
          <div className="text-sm">First to act: <span className="font-mono">{spOrder?.[0] ?? '-'}</span></div>
          <div className="text-sm">Phase: <span className="font-mono">{phase}</span></div>

          {phase !== 'bidding' && (
            <div className="space-y-3">
              <div className="font-semibold">Play</div>
              <div className="text-sm">Leader: {trickLeader}</div>
              {(() => {
                const leaderIdx = spOrder.findIndex((p) => p === trickLeader);
                const rotated = leaderIdx < 0
                  ? spOrder
                  : [...spOrder.slice(leaderIdx), ...spOrder.slice(0, leaderIdx)];
                const currentIdx = spTrickPlays.length; // next to play in this trick
                return (
                  <div className="space-y-1">
                    <div className="text-sm">
                      Playing order:
                      <span className="ml-2 text-xs text-muted-foreground">
                        Position {Math.min(currentIdx + 1, rotated.length)} of {rotated.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 text-xs">
                      {rotated.map((p, i) => (
                        <span
                          key={`play-chip-${p}-${i}`}
                          className={`px-2 py-0.5 rounded border ${
                            i === currentIdx ? 'bg-accent text-accent-foreground border-accent' : 'border-border'
                          }`}
                          title={`Order ${i + 1}`}
                        >
                          <span className="inline-flex items-center">
                            {nameFor(p)}
                            {p !== human && <BotBadge />}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {/* Show current trick with card tiles */}
              <div className="space-y-1">
                <div className="font-medium text-sm">Current trick:</div>
                <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {spTrickPlays.map((p, i) => (
                    <li key={`tp-${p.player}-${i}`} className="border rounded px-2 py-1 flex items-center justify-between">
                      <span className="text-xs mr-2 inline-flex items-center">
                        {nameFor(p.player)}
                        {p.player !== human && <BotBadge />}
                      </span>
                      <span className={`font-mono inline-flex items-center gap-1 ${suitColorClass(p.card.suit)}`} title={`${rankLabel(p.card.rank)} of ${p.card.suit}`}>
                        <span className="font-bold text-sm text-foreground">{rankLabel(p.card.rank)}</span>
                        <span>{suitSymbol(p.card.suit)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="text-sm">
                Tricks won:
                <div className="mt-1 flex flex-wrap gap-1 text-xs">
                  {spOrder.map((p) => (
                    <span key={`won-${p}`} className="px-2 py-0.5 rounded border border-border inline-flex items-center gap-1">
                      <span className="inline-flex items-center">
                        {nameFor(p)}
                        {p !== human && <BotBadge />}
                      </span>
                      <span className="font-mono">{spTrickCounts[p] ?? 0}</span>
                    </span>
                  ))}
                </div>
              </div>
              {/* Player cards moved below scorecard */}
            </div>
          )}

          {(phase === 'done' || isRoundDone) && (
            <div className="space-y-2">
              <div className="font-semibold">Round Complete</div>
              <div className="text-sm">Results:</div>
              <ul className="text-sm">
                {spOrder.map((p) => {
                  const won = spTrickCounts[p] ?? 0;
                  const bid = (state.rounds[roundNo]?.bids?.[p] ?? 0) as number;
                  const made = won === bid;
                  return (
                    <li key={`res-${p}`} className="inline-flex items-center gap-1">
                      <span className="inline-flex items-center">
                        {nameFor(p)}
                        {p !== human && <BotBadge />}
                      </span>
                      : bid {bid}, won {won} — {made ? 'Made' : 'Missed'}
                    </li>
                  );
                })}
              </ul>
              <button
                className="inline-flex items-center rounded border px-3 py-1 text-sm"
                onClick={async () => {
                  const batch: any[] = [];
                  const bidsMap = (state.rounds[roundNo]?.bids ?? {}) as Record<string, number | undefined>;
                  for (const pid of players) {
                    const won = spTrickCounts[pid] ?? 0;
                    const made = won === (bidsMap[pid] ?? 0);
                    batch.push(events.madeSet({ round: roundNo, playerId: pid, made }));
                  }
                  batch.push(events.roundFinalize({ round: roundNo }));
                  await appendMany(batch);
                  setSaved(true);
                }}
              >
                Save to Scorekeeper
              </button>
              <button
                className="inline-flex items-center rounded border px-3 py-1 text-sm ml-2"
                onClick={() => {
                  // Rotate dealer and advance round; then auto-deal next round
                  setDealerIdx((i) => (i + 1) % players.length);
                  setRoundNo((r) => Math.min(10, r + 1));
                  setTimeout(() => onDeal(), 0);
                }}
              >
                Next Round
              </button>
              {!saved && (
                <div className="text-xs text-muted-foreground">Tip: Save to scorekeeper before advancing.</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Scorecard</h2>
        <div className="border rounded">
          {spOrder.length > 0 && (
            <div className="flex items-center justify-between px-2 py-1 border-b">
              {(() => {
                const dealerName = selectSpDealerName(state);
                return (
                  <div className="text-xs text-muted-foreground">
                    Round {roundNo}
                    <span className="mx-2 text-muted-foreground">•</span>
                    <span>Dealer: {dealerName ?? '-'}</span>
                  </div>
                );
              })()}
              <div className="flex items-center gap-4">
                {(() => {
                  const info = selectSpTrumpInfo(state);
                  return (
                    <div
                      className="text-sm font-mono inline-flex items-center gap-1"
                      title={info.trumpCard ? `Trump card: ${rankLabel(info.trumpCard.rank)} of ${info.trumpCard.suit}` : undefined}
                    >
                      <span className="text-xs text-muted-foreground mr-1">Trump:</span>
                      {info.trump && info.trumpCard ? (
                        <>
                          <span className="font-bold text-foreground">{rankLabel(info.trumpCard.rank)}</span>
                          <span className={suitColorClass(info.trump)}>{suitSymbol(info.trump)}</span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  );
                })()}
                <div className="text-sm font-mono inline-flex items-center gap-1">
                  <span className="text-xs text-muted-foreground mr-1">Lead:</span>
                  {(() => {
                    const lead = spTrickPlays[0]?.card as any;
                    if (!lead) return <span className="text-xs text-muted-foreground">—</span>;
                    return (
                      <>
                        <span className="font-bold text-foreground">{rankLabel(lead.rank)}</span>
                        <span className={suitColorClass(lead.suit)}>{suitSymbol(lead.suit)}</span>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
          {(() => {
            const overlay = phase === 'playing' ? selectSpLiveOverlay(state) : null;
            return (
              <CurrentGame
                live={overlay ?? undefined}
                biddingInteractiveIds={[human]}
                onConfirmBid={(r, pid, bid) => {
                  // Confirm this player's bid, auto-bid others if needed, then start playing
                  (async () => {
                    try {
                      // Ignore confirmations for non-current rounds to avoid corrupting other rows
                      if (r !== roundNo) return;
                      // Set this player's bid and auto-bids for others in one batch
                      const batch: any[] = [events.bidSet({ round: r, playerId: pid, bid })];
                      for (const p of spOrder) {
                        if (p === pid) continue;
                        const currentBid = state.rounds[r]?.bids?.[p] ?? null;
                        if (currentBid == null) {
                          const amount = bots.botBid(
                            {
                              trump: spTrump!,
                              hand: spHands[p] ?? [],
                              tricksThisRound: tricks,
                              seatIndex: spOrder.findIndex((x) => x === p),
                              bidsSoFar: (state.rounds[r]?.bids ?? {}) as any,
                              selfId: p,
                            },
                            'normal',
                          );
                          batch.push(events.bidSet({ round: r, playerId: p, bid: amount }));
                        }
                      }
                      // Start playing
                      batch.push(events.roundStateSet({ round: r, state: 'playing' }));
                      batch.push(events.spPhaseSet({ phase: 'playing' }));
                      await appendMany(batch);
                    } catch (e) {
                      console.warn('confirm bid failed', e);
                    }
                  })();
                }}
              />
            );
          })()}
        </div>
      </div>

      {spOrder.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Your Hand ({activePlayers.find(ap => ap.id===human)?.name ?? human})</h2>
          {phase === 'bidding' ? (
            <div className="space-y-1">
              {suitOrder.map((s) => {
                const row = humanBySuit[s];
                if (row.length === 0) return null;
                return (
                  <div key={`bid-row-${s}`} className="flex items-center gap-2">
                    <div className={`w-5 text-center ${suitColorClass(s)}`}>{suitSymbol(s)}</div>
                    <div className="flex flex-wrap gap-1">
                      {row.map((c, i) => (
                        <div
                          key={`bid-${s}-${c.rank}-${i}`}
                          className="border rounded px-2 py-1 text-sm font-mono inline-flex items-center justify-center gap-1 bg-background"
                          title={`${rankLabel(c.rank)} of ${c.suit}`}
                        >
                          <span className="font-bold">{rankLabel(c.rank)}</span>
                          <span className={suitColorClass(c.suit)}>{suitSymbol(c.suit)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <div className="space-y-1">
                {suitOrder.map((s) => {
                  const row = humanBySuit[s];
                  if (row.length === 0) return null;
                  return (
                    <div key={`play-row-${s}`} className="flex items-center gap-2">
                      <div className={`w-5 text-center ${suitColorClass(s)}`}>{suitSymbol(s)}</div>
                      <div className="flex flex-wrap gap-1">
                        {row.map((c, idx) => {
                          const ledSuit = spTrickPlays[0]?.card.suit as any;
                          const trickTrumped = spTrickPlays.some((p) => (p.card as any).suit === spTrump);
                          const canFollow = (spHands[human] ?? []).some((h) => h.suit === ledSuit);
                          let legal = true;
                          if (!ledSuit) {
                            const hasNonTrump = (spHands[human] ?? []).some((h) => h.suit !== spTrump);
                            if (!spTrumpBroken && hasNonTrump && c.suit === spTrump) legal = false;
                          } else if (canFollow) {
                            legal = c.suit === ledSuit;
                          } else if (trickTrumped) {
                            const hasTrump = (spHands[human] ?? []).some((h) => h.suit === spTrump);
                            if (hasTrump) legal = c.suit === spTrump;
                          }
                          const leaderIdx = spOrder.findIndex((p) => p === trickLeader);
                          const rotated = leaderIdx < 0 ? spOrder : [...spOrder.slice(leaderIdx), ...spOrder.slice(0, leaderIdx)];
                          const nextToPlay = rotated[spTrickPlays.length];
                          const isHumansTurn = nextToPlay === human;
                          const isSelected = selectedCard === c;
                          return (
                            <button
                              key={`play-${s}-${c.rank}-${idx}`}
                              className={`border rounded px-2 py-1 text-sm font-mono inline-flex items-center justify-center gap-1 ${legal && isHumansTurn ? '' : 'opacity-40'} ${isSelected ? 'ring-2 ring-sky-500' : ''}`}
                              disabled={!legal || !isHumansTurn}
                              onClick={() => {
                                if (!legal || !isHumansTurn) return;
                                setSelectedCard((prev) => (prev === c ? null : c));
                              }}
                              onDoubleClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const ledSuitNow = spTrickPlays[0]?.card.suit as any;
                                const trickTrumpedNow = spTrickPlays.some((p) => (p.card as any).suit === spTrump);
                                const canFollowNow = (spHands[human] ?? []).some((h) => h.suit === ledSuitNow);
                                let legalNow = true;
                                if (!ledSuitNow) {
                                  const hasNonTrump = (spHands[human] ?? []).some((h) => h.suit !== spTrump);
                                  if (!spTrumpBroken && hasNonTrump && c.suit === spTrump) legalNow = false;
                                } else if (canFollowNow) {
                                  legalNow = c.suit === ledSuitNow;
                                } else if (trickTrumpedNow) {
                                  const hasTrump = (spHands[human] ?? []).some((h) => h.suit === spTrump);
                                  if (hasTrump) legalNow = c.suit === spTrump;
                                }
                                const leaderIdxNow = spOrder.findIndex((p) => p === trickLeader);
                                const rotatedNow = leaderIdxNow < 0 ? spOrder : [...spOrder.slice(leaderIdxNow), ...spOrder.slice(0, leaderIdxNow)];
                                const nextToPlayNow = rotatedNow[spTrickPlays.length];
                                if (!legalNow || nextToPlayNow !== human) return;
                                void append(events.spTrickPlayed({ playerId: human, card: { suit: c.suit as any, rank: c.rank } }));
                                setSelectedCard(null);
                              }}
                              title={`${rankLabel(c.rank)} of ${c.suit}`}
                            >
                              <span className="font-bold">{rankLabel(c.rank)}</span>
                              <span className={suitColorClass(c.suit)}>{suitSymbol(c.suit)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2">
                <button
                  type="button"
                  className="inline-flex items-center rounded border px-3 py-1 text-sm"
                  disabled={!selectedCard}
                  onClick={() => {
                    if (!selectedCard) return;
                    const ledSuit = spTrickPlays[0]?.card.suit as any;
                    const trickTrumped = spTrickPlays.some((p) => (p.card as any).suit === spTrump);
                    const canFollow = (spHands[human] ?? []).some((h) => h.suit === ledSuit);
                    let legal = true;
                    if (!ledSuit) {
                      const hasNonTrump = (spHands[human] ?? []).some((h) => h.suit !== spTrump);
                      if (!spTrumpBroken && hasNonTrump && selectedCard.suit === spTrump) legal = false;
                    } else if (canFollow) {
                      legal = selectedCard.suit === ledSuit;
                    } else if (trickTrumped) {
                      const hasTrump = (spHands[human] ?? []).some((h) => h.suit === spTrump);
                      if (hasTrump) legal = selectedCard.suit === spTrump;
                    }
                    const leaderIdx = spOrder.findIndex((p) => p === trickLeader);
                    const rotated = leaderIdx < 0 ? spOrder : [...spOrder.slice(leaderIdx), ...spOrder.slice(0, leaderIdx)];
                    const nextToPlay = rotated[spTrickPlays.length];
                    if (!legal || nextToPlay !== human) return;
                    void append(events.spTrickPlayed({ playerId: human, card: { suit: selectedCard.suit as any, rank: selectedCard.rank } }));
                    setSelectedCard(null);
                  }}
                >
                  Play Selected
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
