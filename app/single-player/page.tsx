"use client";
import React from 'react';
import { startRound, bots, winnerOfTrick } from '@/lib/single-player';
import CurrentGame from '@/components/views/CurrentGame';
import type { PlayerId, RoundStart, Card } from '@/lib/single-player';
import { tricksForRound } from '@/lib/state/logic';
import { useAppState } from '@/components/state-provider';
import { selectPlayersOrdered, events, archiveCurrentGameAndReset } from '@/lib/state';

export default function SinglePlayerPage() {
  const { state, append, ready } = useAppState();
  const [playersCount, setPlayersCount] = React.useState(4);
  const [dealerIdx, setDealerIdx] = React.useState(0);
  const [humanIdx, setHumanIdx] = React.useState(0);
  const [roundNo, setRoundNo] = React.useState(1);
  const [lastDeal, setLastDeal] = React.useState<RoundStart | null>(null);
  const [phase, setPhase] = React.useState<'setup' | 'bidding' | 'playing' | 'done'>('setup');
  const [bids, setBids] = React.useState<Record<PlayerId, number>>({});
  const [currentBidderIdx, setCurrentBidderIdx] = React.useState(0);
  const [turnOrder, setTurnOrder] = React.useState<PlayerId[]>([]);
  const [trickLeader, setTrickLeader] = React.useState<PlayerId | null>(null);
  const [trickPlays, setTrickPlays] = React.useState<Array<{ player: PlayerId; card: Card; order: number }>>([]);
  const [trickCounts, setTrickCounts] = React.useState<Record<PlayerId, number>>({});
  const [completedTricks, setCompletedTricks] = React.useState(0);
  const [hands, setHands] = React.useState<Record<PlayerId, Card[]>>({});
  const [saved, setSaved] = React.useState(false);
  const [selectedCard, setSelectedCard] = React.useState<Card | null>(null);
  const [trumpBroken, setTrumpBroken] = React.useState(false);
  const [initializedScoring, setInitializedScoring] = React.useState(false);
  const [autoDealt, setAutoDealt] = React.useState(false);
  const SESSION_KEY = 'single-player:session:v1';

  const appPlayers = React.useMemo(() => selectPlayersOrdered(state), [state]);
  const activePlayers = React.useMemo(() => appPlayers.slice(0, playersCount), [appPlayers, playersCount]);
  const players = React.useMemo(() => activePlayers.map((p) => p.id), [activePlayers]);
  const dealer = players[dealerIdx] ?? players[0]!;
  const human = players[humanIdx] ?? players[0]!;
  const tricks = tricksForRound(roundNo);
  const useTwoDecks = playersCount > 5;

  const onDeal = async () => {
    setSaved(false);
    setSelectedCard(null);
    setTrumpBroken(false);
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
    setLastDeal(deal);
    setPhase('bidding');
    setBids({});
    setCurrentBidderIdx(0);
    setTurnOrder(deal.order);
    setTrickLeader(deal.firstToAct);
    setTrickPlays([]);
    setHands(deal.hands);
    const emptyCounts: Record<PlayerId, number> = {};
    for (const p of players) emptyCounts[p] = 0;
    setTrickCounts(emptyCounts);
    setCompletedTricks(0);

    // Ensure the current round is set to bidding (do not touch other rounds to avoid flicker)
    try {
      await append(events.roundStateSet({ round: roundNo, state: 'bidding' }));
    } catch (e) {
      console.warn('Failed to set current round to bidding', e);
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

  // Restore session from localStorage if available (preempts auto-deal)
  React.useEffect(() => {
    if (!ready) return;
    if (autoDealt) return;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return;
      // Basic sanity check
      if (!Array.isArray(s.players) || !s.roundNo) return;
      // Restore core state
      setPhase(s.phase ?? 'bidding');
      setRoundNo(s.roundNo);
      setDealerIdx(s.dealerIdx ?? 0);
      setHumanIdx(s.humanIdx ?? 0);
      setLastDeal(s.lastDeal ?? null);
      setBids(s.bids ?? {});
      setTurnOrder(s.turnOrder ?? []);
      setTrickLeader(s.trickLeader ?? null);
      setTrickPlays(s.trickPlays ?? []);
      setTrickCounts(s.trickCounts ?? {});
      setHands(s.hands ?? {});
      setTrumpBroken(!!s.trumpBroken);
      setCompletedTricks(s.completedTricks ?? 0);
      setInitializedScoring(true);
      setAutoDealt(true);
    } catch (e) {
      console.warn('Failed to restore single-player session', e);
    }
  }, [ready, autoDealt]);

  // Persist session snapshot to localStorage so hard refresh can restore
  React.useEffect(() => {
    try {
      if (!lastDeal) return;
      const snapshot = {
        phase,
        roundNo,
        dealerIdx,
        humanIdx,
        players,
        bids,
        turnOrder,
        trickLeader,
        trickPlays,
        trickCounts,
        hands,
        lastDeal,
        trumpBroken,
        completedTricks,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
    } catch (e) {
      // best effort only
    }
  }, [lastDeal, phase, roundNo, dealerIdx, humanIdx, players, bids, turnOrder, trickLeader, trickPlays, trickCounts, hands, trumpBroken, completedTricks]);

  const humanHand = lastDeal?.hands[human] ?? [];

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
    if (!lastDeal || phase !== 'playing' || !trickLeader) return;
    const leaderIdx = turnOrder.findIndex((p) => p === trickLeader);
    if (leaderIdx < 0) return;
    const rotated = [...turnOrder.slice(leaderIdx), ...turnOrder.slice(0, leaderIdx)];
    const nextToPlay = rotated[trickPlays.length];
    if (!nextToPlay) return;
    // If trick complete
    if (trickPlays.length === turnOrder.length) return; // will be handled in another effect
    // If it's a bot, play automatically
    if (nextToPlay !== human) {
      const pid = nextToPlay;
      const botHand = hands[pid] ?? [];
      // Build context and let bot choose
      const card = bots.botPlay(
        {
          trump: lastDeal.trump,
          trickPlays,
          hand: botHand,
          tricksThisRound: tricks,
          seatIndex: turnOrder.findIndex((p) => p === pid),
          bidsSoFar: bids,
          tricksWonSoFar: trickCounts,
          selfId: pid,
          trumpBroken,
        },
        'normal',
      );
      const idx = botHand.findIndex((c) => c === card);
      const play = { player: pid, card, order: trickPlays.length };
      // Slight delay for UX
      const t = setTimeout(() => {
        setTrickPlays((tp) => [...tp, play]);
        setHands((h) => ({ ...h, [pid]: (h[pid] ?? []).filter((_, i) => i !== idx) }));
        // Persist to store
        void append(events.spTrickPlayed({ playerId: pid, card: { suit: card.suit as any, rank: card.rank } }));
      }, 250);
      return () => clearTimeout(t);
    }
  }, [phase, trickPlays, trickLeader, hands, lastDeal, bids, trickCounts, human, tricks, turnOrder]);

  // Auto-bid for bots during bidding phase
  React.useEffect(() => {
    if (!lastDeal || phase !== 'bidding') return;
    const pid = turnOrder[currentBidderIdx];
    if (!pid || pid === human) return;
    const amount = bots.botBid(
      {
        trump: lastDeal.trump,
        hand: hands[pid] ?? [],
        tricksThisRound: tricks,
        seatIndex: currentBidderIdx,
        bidsSoFar: bids,
        selfId: pid,
        // trumpBroken not relevant during bidding; omit
      },
      'normal',
    );
    const t = setTimeout(() => {
      setBids((m) => ({ ...m, [pid]: amount }));
      void append(events.bidSet({ round: roundNo, playerId: pid, bid: amount }));
      const nextIdx = currentBidderIdx + 1;
      if (nextIdx >= turnOrder.length) {
        setPhase('playing');
        void append(events.roundStateSet({ round: roundNo, state: 'playing' }));
      }
      setCurrentBidderIdx(nextIdx);
    }, 300);
    return () => clearTimeout(t);
  }, [phase, currentBidderIdx, turnOrder, human, lastDeal, hands, bids, tricks]);

  // Resolve completed trick
  React.useEffect(() => {
    if (!lastDeal || phase !== 'playing' || !trickLeader) return;
    if (trickPlays.length < turnOrder.length) return;
    // Determine winner
    const winner = winnerOfTrick(trickPlays as any, lastDeal.trump);
    if (!winner) return;
    const t = setTimeout(() => {
      // If any off-suit trump was played this trick, mark trump as broken for future leads
      const ledSuit = trickPlays[0]?.card.suit;
      const anyTrump = trickPlays.some((p) => p.card.suit === lastDeal.trump);
      if (!trumpBroken && anyTrump && ledSuit && ledSuit !== lastDeal.trump) {
        setTrumpBroken(true);
        void append(events.spTrumpBrokenSet({ broken: true }));
      }
      setTrickCounts((tc) => ({ ...tc, [winner]: (tc[winner] ?? 0) + 1 }));
      setTrickLeader(winner);
      setTrickPlays([]);
      void append(events.spTrickCleared({ winnerId: winner }));
      setCompletedTricks((n) => {
        const next = n + 1;
        if (next >= tricks) setPhase('done');
        return next;
      });
    }, 800); // leave the full trick visible a bit longer
    return () => clearTimeout(t);
  }, [trickPlays, turnOrder.length, lastDeal, phase, trickLeader, tricks]);

  // Auto-sync results to scorekeeper when round ends
  React.useEffect(() => {
    if (phase !== 'done' || !lastDeal) return;
    if (saved) return; // already synced
    (async () => {
      try {
        for (const pid of players) {
          const won = trickCounts[pid] ?? 0;
          const made = won === (bids[pid] ?? 0);
          await append(events.madeSet({ round: roundNo, playerId: pid, made }));
        }
        await append(events.roundFinalize({ round: roundNo }));
        setSaved(true);
        // Automatically deal next round if any remain
        if (roundNo < 10) {
          setDealerIdx((i) => (i + 1) % players.length);
          setRoundNo((r) => Math.min(10, r + 1));
          // Allow brief pause, then deal next round
          setTimeout(() => {
            void onDeal();
          }, 400);
        } else {
          // For the final round, make previous round (round 9) active for bidding and keep this round scored
          try {
            await append(events.roundStateSet({ round: 9, state: 'bidding' }));
          } catch (e) {
            console.warn('failed to set round 9 to bidding after round 10 scored', e);
          }
        }
      } catch (e) {
        console.warn('Failed to auto-sync results', e);
      }
    })();
  }, [phase, lastDeal, bids, trickCounts, players, roundNo, append, saved]);

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

      {lastDeal && (
        <div className="space-y-2">
          <div className="text-sm">
            Trump:{' '}
            <span
              className="font-mono text-lg inline-flex items-center gap-1"
              title={`Trump card: ${rankLabel(lastDeal.trumpCard.rank)} of ${lastDeal.trumpCard.suit}`}
            >
              <span className="font-bold text-foreground">{rankLabel(lastDeal.trumpCard.rank)}</span>
              <span className={suitColorClass(lastDeal.trump)}>{suitSymbol(lastDeal.trump)}</span>
            </span>
          </div>
          <div className="text-sm">First to act: <span className="font-mono">{lastDeal.firstToAct}</span></div>
          <div className="text-sm">Deck remaining: <span className="font-mono">{lastDeal.deckRemaining}</span></div>
          <div className="text-sm">Phase: <span className="font-mono">{phase}</span></div>

          {phase === 'bidding' && (
            <div className="space-y-2">
              <div className="font-semibold">Bidding</div>
              <div className="text-sm">
                Current bidder:{' '}
                <strong className="inline-flex items-center">
                  {nameFor(turnOrder[currentBidderIdx])}
                  {turnOrder[currentBidderIdx] !== human && <BotBadge />}
                </strong>
                <span className="ml-2 text-xs text-muted-foreground">
                  ({currentBidderIdx + 1} of {turnOrder.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1 text-xs">
                {turnOrder.map((p, i) => (
                  <span
                    key={`bid-chip-${p}-${i}`}
                    className={`px-2 py-0.5 rounded border ${
                      i === currentBidderIdx ? 'bg-accent text-accent-foreground border-accent' : 'border-border'
                    }`}
                    title={`Seat ${i + 1}`}
                  >
                    <span className="inline-flex items-center">
                      {nameFor(p)}
                      {p !== human && <BotBadge />}
                    </span>
                  </span>
                ))}
              </div>
              {turnOrder[currentBidderIdx] === human ? (
                <div className="flex items-center gap-2">
                  <label className="text-sm">Your bid:</label>
                  <input
                    className="border rounded px-2 py-1 w-24"
                    type="number"
                    min={0}
                    max={tricks}
                    value={bids[human] ?? 0}
                    onChange={(e) => setBids((m) => ({ ...m, [human]: Math.max(0, Math.min(tricks, Number(e.target.value) || 0)) }))}
                  />
                  <button
                    className="inline-flex items-center rounded border px-2 py-1 text-sm"
                    onClick={() => {
                      const amount = Math.max(0, Math.min(tricks, Math.round(bids[human] ?? 0)));
                      setBids((m) => ({ ...m, [human]: amount }));
                      void append(events.bidSet({ round: roundNo, playerId: human, bid: amount }));
                      const nextIdx = currentBidderIdx + 1;
                      if (nextIdx >= turnOrder.length) {
                        setPhase('playing');
                        void append(events.roundStateSet({ round: roundNo, state: 'playing' }));
                      }
                      setCurrentBidderIdx(nextIdx);
                    }}
                  >
                    Confirm
                  </button>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Bot is bidding…</span>
              )}
              <div className="text-xs text-muted-foreground">Bids: {turnOrder.map((p) => `${p}:${bids[p] ?? '-'}`).join('  ')}</div>
            </div>
          )}

          {phase !== 'bidding' && (
            <div className="space-y-3">
              <div className="font-semibold">Play</div>
              <div className="text-sm">Leader: {trickLeader}</div>
              {(() => {
                const leaderIdx = turnOrder.findIndex((p) => p === trickLeader);
                const rotated = leaderIdx < 0
                  ? turnOrder
                  : [...turnOrder.slice(leaderIdx), ...turnOrder.slice(0, leaderIdx)];
                const currentIdx = trickPlays.length; // next to play in this trick
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
                  {trickPlays.map((p, i) => (
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
                  {turnOrder.map((p) => (
                    <span key={`won-${p}`} className="px-2 py-0.5 rounded border border-border inline-flex items-center gap-1">
                      <span className="inline-flex items-center">
                        {nameFor(p)}
                        {p !== human && <BotBadge />}
                      </span>
                      <span className="font-mono">{trickCounts[p] ?? 0}</span>
                    </span>
                  ))}
                </div>
              </div>
              {/* Player cards moved below scorecard */}
            </div>
          )}

          {phase === 'done' && (
            <div className="space-y-2">
              <div className="font-semibold">Round Complete</div>
              <div className="text-sm">Results:</div>
              <ul className="text-sm">
                {turnOrder.map((p) => {
                  const won = trickCounts[p] ?? 0;
                  const bid = bids[p] ?? 0;
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
                  for (const pid of players) {
                    const bid = Math.max(0, Math.min(tricks, Math.round(bids[pid] ?? 0)));
                    await append(events.bidSet({ round: roundNo, playerId: pid, bid }));
                  }
                  for (const pid of players) {
                    const won = trickCounts[pid] ?? 0;
                    const made = won === (bids[pid] ?? 0);
                    await append(events.madeSet({ round: roundNo, playerId: pid, made }));
                  }
                  await append(events.roundFinalize({ round: roundNo }));
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
          {lastDeal && (
            <div className="flex items-center justify-between px-2 py-1 border-b">
              <div className="text-xs text-muted-foreground">
                Round {roundNo}
                <span className="mx-2 text-muted-foreground">•</span>
                <span>
                  Dealer: {activePlayers.find((ap) => ap.id === dealer)?.name ?? dealer}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div
                  className="text-sm font-mono inline-flex items-center gap-1"
                  title={`Trump card: ${rankLabel(lastDeal.trumpCard.rank)} of ${lastDeal.trumpCard.suit}`}
                >
                  <span className="text-xs text-muted-foreground mr-1">Trump:</span>
                  <span className="font-bold text-foreground">{rankLabel(lastDeal.trumpCard.rank)}</span>
                  <span className={suitColorClass(lastDeal.trump)}>{suitSymbol(lastDeal.trump)}</span>
                </div>
                <div className="text-sm font-mono inline-flex items-center gap-1">
                  <span className="text-xs text-muted-foreground mr-1">Lead:</span>
                  {(() => {
                    const lead = trickPlays[0]?.card;
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
            const leaderIdx = turnOrder.findIndex((p) => p === trickLeader);
            const rotated = leaderIdx < 0 ? turnOrder : [...turnOrder.slice(leaderIdx), ...turnOrder.slice(0, leaderIdx)];
            const nextToPlay = phase === 'playing' ? rotated[trickPlays.length] : null;
            const cards: Record<string, { suit: 'clubs'|'diamonds'|'hearts'|'spades'; rank: number } | null> = {} as any;
            if (phase !== 'bidding') {
              for (const p of turnOrder) (cards as any)[p] = null;
              for (const tp of trickPlays) (cards as any)[tp.player] = { suit: tp.card.suit as any, rank: tp.card.rank };
            }
            return (
              <CurrentGame
                live={
                  phase === 'playing'
                    ? { round: roundNo, currentPlayerId: nextToPlay, cards, counts: trickCounts as any }
                    : undefined
                }
                biddingInteractiveIds={[human]}
                onConfirmBid={(r, pid, bid) => {
                  // Confirm this player's bid, auto-bid others if needed, then start playing
                  (async () => {
                    try {
                      // Ignore confirmations for non-current rounds to avoid corrupting other rows
                      if (r !== roundNo) return;
                      // Set this player's bid
                      setBids((m) => ({ ...m, [pid]: bid }));
                      await append(events.bidSet({ round: r, playerId: pid, bid }));
                      // For any others without bids, auto-bid using simple bot
                      for (const p of turnOrder) {
                        if (p === pid) continue;
                        const has = (bids[p] ?? null) !== null && (bids[p] ?? undefined) !== undefined;
                        const currentBid = has ? (bids[p] as number) : (state.rounds[r]?.bids[p] ?? null);
                        if (currentBid == null) {
                          const amount = bots.botBid(
                            {
                              trump: lastDeal!.trump,
                              hand: hands[p] ?? [],
                              tricksThisRound: tricks,
                              seatIndex: turnOrder.findIndex((x) => x === p),
                              bidsSoFar: bids,
                              selfId: p,
                            },
                            'normal',
                          );
                          setBids((m) => ({ ...m, [p]: amount }));
                          await append(events.bidSet({ round: r, playerId: p, bid: amount }));
                        }
                      }
                      // Start playing
                      setPhase('playing');
                      await append(events.roundStateSet({ round: r, state: 'playing' }));
                      await append(events.spPhaseSet({ phase: 'playing' }));
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

      {lastDeal && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Your Hand ({activePlayers.find(ap => ap.id===human)?.name ?? human})</h2>
          {phase === 'bidding' ? (
            <div className="space-y-1">
              {suitOrder.map((s) => {
                const row = humanHand.filter((c) => c.suit === s).sort((a,b)=> b.rank - a.rank);
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
                  const row = (hands[human] ?? []).filter((c) => c.suit === s).sort((a,b)=> b.rank - a.rank);
                  if (row.length === 0) return null;
                  return (
                    <div key={`play-row-${s}`} className="flex items-center gap-2">
                      <div className={`w-5 text-center ${suitColorClass(s)}`}>{suitSymbol(s)}</div>
                      <div className="flex flex-wrap gap-1">
                        {row.map((c, idx) => {
                          const ledSuit = trickPlays[0]?.card.suit;
                          const trickTrumped = trickPlays.some((p) => p.card.suit === lastDeal!.trump);
                          const canFollow = (hands[human] ?? []).some((h) => h.suit === ledSuit);
                          let legal = true;
                          if (!ledSuit) {
                            const hasNonTrump = (hands[human] ?? []).some((h) => h.suit !== lastDeal!.trump);
                            if (!trumpBroken && hasNonTrump && c.suit === lastDeal!.trump) legal = false;
                          } else if (canFollow) {
                            legal = c.suit === ledSuit;
                          } else if (trickTrumped) {
                            const hasTrump = (hands[human] ?? []).some((h) => h.suit === lastDeal!.trump);
                            if (hasTrump) legal = c.suit === lastDeal!.trump;
                          }
                          const leaderIdx = turnOrder.findIndex((p) => p === trickLeader);
                          const rotated = leaderIdx < 0 ? turnOrder : [...turnOrder.slice(leaderIdx), ...turnOrder.slice(0, leaderIdx)];
                          const nextToPlay = rotated[trickPlays.length];
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
                                const ledSuitNow = trickPlays[0]?.card.suit;
                                const trickTrumpedNow = trickPlays.some((p) => p.card.suit === lastDeal!.trump);
                                const canFollowNow = (hands[human] ?? []).some((h) => h.suit === ledSuitNow);
                                let legalNow = true;
                                if (!ledSuitNow) {
                                  const hasNonTrump = (hands[human] ?? []).some((h) => h.suit !== lastDeal!.trump);
                                  if (!trumpBroken && hasNonTrump && c.suit === lastDeal!.trump) legalNow = false;
                                } else if (canFollowNow) {
                                  legalNow = c.suit === ledSuitNow;
                                } else if (trickTrumpedNow) {
                                  const hasTrump = (hands[human] ?? []).some((h) => h.suit === lastDeal!.trump);
                                  if (hasTrump) legalNow = c.suit === lastDeal!.trump;
                                }
                                const leaderIdxNow = turnOrder.findIndex((p) => p === trickLeader);
                                const rotatedNow = leaderIdxNow < 0 ? turnOrder : [...turnOrder.slice(leaderIdxNow), ...turnOrder.slice(0, leaderIdxNow)];
                                const nextToPlayNow = rotatedNow[trickPlays.length];
                                if (!legalNow || nextToPlayNow !== human) return;
                                setTrickPlays((tp) => [...tp, { player: human, card: c, order: tp.length }]);
                                setHands((h) => {
                                  const arr = (h[human] ?? []);
                                  const removeIdx = arr.findIndex((hc) => hc === c);
                                  const nextArr = removeIdx >= 0 ? [...arr.slice(0, removeIdx), ...arr.slice(removeIdx + 1)] : arr.slice();
                                  return { ...h, [human]: nextArr };
                                });
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
                    const ledSuit = trickPlays[0]?.card.suit;
                    const trickTrumped = trickPlays.some((p) => p.card.suit === lastDeal!.trump);
                    const canFollow = (hands[human] ?? []).some((h) => h.suit === ledSuit);
                    let legal = true;
                    if (!ledSuit) {
                      const hasNonTrump = (hands[human] ?? []).some((h) => h.suit !== lastDeal!.trump);
                      if (!trumpBroken && hasNonTrump && selectedCard.suit === lastDeal!.trump) legal = false;
                    } else if (canFollow) {
                      legal = selectedCard.suit === ledSuit;
                    } else if (trickTrumped) {
                      const hasTrump = (hands[human] ?? []).some((h) => h.suit === lastDeal!.trump);
                      if (hasTrump) legal = selectedCard.suit === lastDeal!.trump;
                    }
                    const leaderIdx = turnOrder.findIndex((p) => p === trickLeader);
                    const rotated = leaderIdx < 0 ? turnOrder : [...turnOrder.slice(leaderIdx), ...turnOrder.slice(0, leaderIdx)];
                    const nextToPlay = rotated[trickPlays.length];
                    if (!legal || nextToPlay !== human) return;
                    setTrickPlays((tp) => [...tp, { player: human, card: selectedCard, order: tp.length }]);
                    setHands((h) => {
                      const arr = (h[human] ?? []);
                      const idx = arr.findIndex((hc) => hc === selectedCard);
                      const nextArr = idx >= 0 ? [...arr.slice(0, idx), ...arr.slice(idx + 1)] : arr.slice();
                      return { ...h, [human]: nextArr };
                    });
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
