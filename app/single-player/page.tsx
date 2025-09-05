"use client";
import React from 'react';
import { startRound } from '@/lib/single-player';
import type { PlayerId, RoundStart } from '@/lib/single-player';
import { tricksForRound } from '@/lib/state/logic';

function makePlayers(n: number): PlayerId[] {
  return Array.from({ length: n }, (_, i) => `P${i + 1}`);
}

export default function SinglePlayerPage() {
  const [playersCount, setPlayersCount] = React.useState(4);
  const [dealerIdx, setDealerIdx] = React.useState(0);
  const [humanIdx, setHumanIdx] = React.useState(0);
  const [roundNo, setRoundNo] = React.useState(1);
  const [lastDeal, setLastDeal] = React.useState<RoundStart | null>(null);

  const players = React.useMemo(() => makePlayers(playersCount), [playersCount]);
  const dealer = players[dealerIdx] ?? players[0]!;
  const human = players[humanIdx] ?? players[0]!;
  const tricks = tricksForRound(roundNo);
  const useTwoDecks = playersCount > 5;

  const onDeal = () => {
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
  };

  const humanHand = lastDeal?.hands[human] ?? [];

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
            {players.map((p, i) => (
              <option key={p} value={i}>{`${p}`}</option>
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
            {players.map((p, i) => (
              <option key={p} value={i}>{`${p}`}</option>
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
          <div>
            <div className="font-semibold">Your Hand ({human}):</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {humanHand
                .slice()
                .sort((a, b) => (a.suit === b.suit ? b.rank - a.rank : a.suit.localeCompare(b.suit)))
                .map((c, idx) => (
                  <div key={`${c.suit}-${c.rank}-${idx}`} className="border rounded px-2 py-1 text-sm font-mono">
                    {c.rank} of {c.suit}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
