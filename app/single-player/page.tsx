"use client";
import React from 'react';
import { startRound, bots, winnerOfTrick } from '@/lib/single-player';
import type { PlayerId, RoundStart, Card } from '@/lib/single-player';
import { tricksForRound } from '@/lib/state/logic';
import { useAppState } from '@/components/state-provider';
import { selectPlayersOrdered, events } from '@/lib/state';

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

  const appPlayers = React.useMemo(() => selectPlayersOrdered(state), [state]);
  const activePlayers = React.useMemo(() => appPlayers.slice(0, playersCount), [appPlayers, playersCount]);
  const players = React.useMemo(() => activePlayers.map((p) => p.id), [activePlayers]);
  const dealer = players[dealerIdx] ?? players[0]!;
  const human = players[humanIdx] ?? players[0]!;
  const tricks = tricksForRound(roundNo);
  const useTwoDecks = playersCount > 5;

  const onDeal = () => {
    setSaved(false);
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
  };

  const humanHand = lastDeal?.hands[human] ?? [];

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
        },
        'normal',
      );
      const idx = botHand.findIndex((c) => c === card);
      const play = { player: pid, card, order: trickPlays.length };
      // Slight delay for UX
      const t = setTimeout(() => {
        setTrickPlays((tp) => [...tp, play]);
        setHands((h) => ({ ...h, [pid]: (h[pid] ?? []).filter((_, i) => i !== idx) }));
      }, 250);
      return () => clearTimeout(t);
    }
  }, [phase, trickPlays, trickLeader, hands, lastDeal, bids, trickCounts, human, tricks, turnOrder]);

  // Resolve completed trick
  React.useEffect(() => {
    if (!lastDeal || phase !== 'playing' || !trickLeader) return;
    if (trickPlays.length < turnOrder.length) return;
    // Determine winner
    const winner = winnerOfTrick(trickPlays as any, lastDeal.trump);
    if (!winner) return;
    const t = setTimeout(() => {
      setTrickCounts((tc) => ({ ...tc, [winner]: (tc[winner] ?? 0) + 1 }));
      setTrickLeader(winner);
      setTrickPlays([]);
      setCompletedTricks((n) => {
        const next = n + 1;
        if (next >= tricks) setPhase('done');
        return next;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [trickPlays, turnOrder.length, lastDeal, phase, trickLeader, tricks]);

  return (
    <main className="p-4 space-y-4">
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
          <div className="text-sm">Trump: <span className="font-mono">{lastDeal.trump}</span></div>
          <div className="text-sm">First to act: <span className="font-mono">{lastDeal.firstToAct}</span></div>
          <div className="text-sm">Deck remaining: <span className="font-mono">{lastDeal.deckRemaining}</span></div>
          <div className="text-sm">Phase: <span className="font-mono">{phase}</span></div>

          {phase === 'bidding' && (
            <div className="space-y-2">
              <div className="font-semibold">Bidding</div>
              <div className="text-sm">Current bidder: {turnOrder[currentBidderIdx]}</div>
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
                      const nextIdx = currentBidderIdx + 1;
                      if (nextIdx >= turnOrder.length) {
                        setPhase('playing');
                      }
                      setCurrentBidderIdx(nextIdx);
                    }}
                  >
                    Confirm
                  </button>
                </div>
              ) : (
                <button
                  className="inline-flex items-center rounded border px-2 py-1 text-sm"
                  onClick={() => {
                    const pid = turnOrder[currentBidderIdx]!;
                    const amount = bots.botBid(
                      {
                        trump: lastDeal.trump,
                        hand: hands[pid] ?? [],
                        tricksThisRound: tricks,
                        seatIndex: currentBidderIdx,
                        bidsSoFar: bids,
                        selfId: pid,
                      },
                      'normal',
                    );
                    setBids((m) => ({ ...m, [pid]: amount }));
                    const nextIdx = currentBidderIdx + 1;
                    if (nextIdx >= turnOrder.length) {
                      setPhase('playing');
                    }
                    setCurrentBidderIdx(nextIdx);
                  }}
                >
                  Make Bot Bid
                </button>
              )}
              <div className="text-xs text-muted-foreground">Bids: {turnOrder.map((p) => `${p}:${bids[p] ?? '-'}`).join('  ')}</div>
            </div>
          )}

          {phase !== 'bidding' && (
            <div className="space-y-3">
              <div className="font-semibold">Play</div>
              <div className="text-sm">Leader: {trickLeader}</div>
              <div className="text-sm">Turn order: {(() => {
                const leaderIdx = turnOrder.findIndex((p) => p === trickLeader);
                if (leaderIdx < 0) return turnOrder.join(' → ');
                const rotated = [...turnOrder.slice(leaderIdx), ...turnOrder.slice(0, leaderIdx)];
                return rotated.join(' → ');
              })()}</div>
              <div className="text-sm">Current trick: {trickPlays.map((p) => `${p.player}(${p.card.rank}${p.card.suit[0]})`).join(', ') || '-'}</div>
              <div className="text-sm">Tricks won: {turnOrder.map((p) => `${activePlayers.find(ap => ap.id===p)?.name ?? p}:${trickCounts[p] ?? 0}`).join('  ')}</div>
              <div>
                <div className="font-semibold">Your Hand ({activePlayers.find(ap => ap.id===human)?.name ?? human}):</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {hands[human]?.slice()
                    .sort((a, b) => (a.suit === b.suit ? b.rank - a.rank : a.suit.localeCompare(b.suit)))
                    .map((c, idx) => {
                      const ledSuit = trickPlays[0]?.card.suit;
                      const trickTrumped = trickPlays.some((p) => p.card.suit === lastDeal.trump);
                      const canFollow = (hands[human] ?? []).some((h) => h.suit === ledSuit);
                      let legal = true;
                      if (!ledSuit) {
                        const hasNonTrump = (hands[human] ?? []).some((h) => h.suit !== lastDeal.trump);
                        if (hasNonTrump && c.suit === lastDeal.trump) legal = false;
                      } else if (canFollow) {
                        legal = c.suit === ledSuit;
                      } else if (trickTrumped) {
                        const hasTrump = (hands[human] ?? []).some((h) => h.suit === lastDeal.trump);
                        if (hasTrump) legal = c.suit === lastDeal.trump;
                      }
                      const leaderIdx = turnOrder.findIndex((p) => p === trickLeader);
                      const rotated = leaderIdx < 0 ? turnOrder : [...turnOrder.slice(leaderIdx), ...turnOrder.slice(0, leaderIdx)];
                      const nextToPlay = rotated[trickPlays.length];
                      const isHumansTurn = nextToPlay === human;
                      return (
                        <button
                          key={`${c.suit}-${c.rank}-${idx}`}
                          className={`border rounded px-2 py-1 text-sm font-mono text-left ${legal && isHumansTurn ? '' : 'opacity-40 cursor-not-allowed'}`}
                          disabled={!legal || !isHumansTurn}
                          onClick={() => {
                            if (!legal) return;
                            setTrickPlays((tp) => [...tp, { player: human, card: c, order: tp.length }]);
                            setHands((h) => ({ ...h, [human]: (h[human] ?? []).filter((hc, i) => !(hc === c && i === idx)) }));
                          }}
                          title={`${c.rank} of ${c.suit}`}
                        >
                          {c.rank} of {c.suit}
                        </button>
                      );
                    })}
                </div>
              </div>
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
                    <li key={`res-${p}`}>
                      {(activePlayers.find((ap) => ap.id === p)?.name ?? p)}: bid {bid}, won {won} — {made ? 'Made' : 'Missed'}
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
    </main>
  );
}
