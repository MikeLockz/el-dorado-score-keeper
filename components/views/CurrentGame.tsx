'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, X, Plus, Minus } from 'lucide-react';
import { useAppState } from '@/components/state-provider';
import { twoCharAbbrs } from '@/lib/utils';
import { roundDelta, ROUNDS_TOTAL, tricksForRound } from '@/lib/state/logic';
import { selectCumulativeScoresAllRounds, selectRoundInfosAll } from '@/lib/state/selectors';
import type { RoundState } from '@/lib/state/types';
import { events } from '@/lib/state/events';

function labelForRoundState(s: RoundState) {
  return s === 'locked'
    ? 'Locked'
    : s === 'bidding'
      ? 'Active'
      : s === 'complete'
        ? 'Complete'
        : 'Scored';
}

function getRoundStateStyles(state: RoundState) {
  switch (state) {
    case 'locked':
      return 'bg-gray-900 text-gray-400';
    case 'bidding':
      return 'bg-sky-300 text-sky-900 shadow-sm';
    case 'complete':
      return 'bg-orange-300 text-orange-900';
    case 'scored':
      return 'bg-emerald-300 text-emerald-900';
  }
}

function getPlayerCellBackgroundStyles(state: RoundState) {
  switch (state) {
    case 'locked':
      return 'bg-gray-900';
    case 'bidding':
      return 'bg-sky-50';
    case 'complete':
      return 'bg-orange-50';
    case 'scored':
      return 'bg-emerald-50';
  }
}

// Shrinks row text to keep everything on a single line without wrapping
function FitRow({
  full,
  abbrev,
  className,
  maxRem = 0.65,
  minRem = 0.5,
  step = 0.02,
  abbrevAtRem = 0.55,
}: {
  full: React.ReactNode;
  abbrev?: React.ReactNode;
  className?: string;
  maxRem?: number;
  minRem?: number;
  step?: number;
  abbrevAtRem?: number;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState(maxRem);
  const [useAbbrev, setUseAbbrev] = React.useState(false);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const fit = () => {
      if (!el) return;
      let current = maxRem;
      el.style.fontSize = `${current}rem`;
      // Ensure no wrapping and reduce until it fits
      while (
        (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) &&
        current > minRem
      ) {
        current = Math.max(minRem, current - step);
        el.style.fontSize = `${current}rem`;
      }
      setSize(current);
      if (!useAbbrev && abbrev && current <= abbrevAtRem) {
        // Switch to abbreviated labels and let next frame refit
        setUseAbbrev(true);
      }
    };
    fit();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [maxRem, minRem, step, full, abbrev, useAbbrev, abbrevAtRem]);

  return (
    <div
      ref={ref}
      className={`whitespace-nowrap overflow-hidden ${className ?? ''}`}
      style={{ fontSize: `${size}rem` }}
    >
      {useAbbrev && abbrev ? abbrev : full}
    </div>
  );
}

export default function CurrentGame() {
  const { state, append, ready } = useAppState();
  const players = Object.entries(state.players).map(([id, name]) => ({ id, name }));
  const abbr = twoCharAbbrs(players);
  const [detailCells, setDetailCells] = React.useState<Record<string, boolean>>({});
  const toggleCellDetails = (round: number, playerId: string) => {
    const key = `${round}-${playerId}`;
    setDetailCells((m) => ({ ...m, [key]: !m[key] }));
  };

  // Precompute heavy derived data once per state change
  const totalsByRound = React.useMemo(() => selectCumulativeScoresAllRounds(state), [state]);
  const roundInfoByRound = React.useMemo(() => selectRoundInfosAll(state), [state]);

  // Before state hydration: show 4 placeholder columns to avoid layout shift.
  const DEFAULT_COLUMNS = 4;
  const useDefault = !ready;
  const columnCount = useDefault ? DEFAULT_COLUMNS : players.length;
  const columns: Array<{ id: string; name: string; placeholder: boolean }> = useDefault
    ? Array.from({ length: DEFAULT_COLUMNS }, (_, i) => ({
        id: `placeholder-${i}`,
        name: '-',
        placeholder: true,
      }))
    : players.map((p) => ({ ...p, placeholder: false }));

  const incrementBid = async (round: number, playerId: string, max: number) => {
    const current = state.rounds[round]?.bids[playerId] ?? 0;
    const next = Math.min(max, current + 1);
    if (next !== current) await append(events.bidSet({ round, playerId, bid: next }));
  };
  const decrementBid = async (round: number, playerId: string) => {
    const current = state.rounds[round]?.bids[playerId] ?? 0;
    const next = Math.max(0, current - 1);
    if (next !== current) await append(events.bidSet({ round, playerId, bid: next }));
  };
  const toggleMade = async (round: number, playerId: string, made: boolean) => {
    await append(events.madeSet({ round, playerId, made }));
  };

  const cycleRoundState = async (round: number) => {
    const current = state.rounds[round]?.state ?? 'locked';
    if (current === 'locked') return;
    if (current === 'bidding') {
      await append(events.roundStateSet({ round, state: 'complete' }));
      return;
    }
    if (current === 'complete') {
      const allMarked = players.every((p) => (state.rounds[round]?.made[p.id] ?? null) !== null);
      if (allMarked) {
        await append(events.roundFinalize({ round }));
      }
      return;
    }
    if (current === 'scored') {
      await append(events.roundStateSet({ round, state: 'bidding' }));
    }
  };

  return (
    <div className="p-2 mx-auto">
      <Card className="overflow-hidden shadow-lg">
        <div
          className="grid text-[0.65rem] sm:text-xs"
          style={{ gridTemplateColumns: `3rem repeat(${columnCount}, 1fr)` }}
        >
          <div className="bg-slate-700 text-white p-1 font-bold text-center border-b border-r">
            Rd
          </div>
          {columns.map((c) => (
            <div
              key={`hdr-${c.id}`}
              className="bg-slate-700 text-white p-1 font-bold text-center border-b"
            >
              {c.placeholder ? '-' : (abbr[c.id] ?? c.name.substring(0, 2))}
            </div>
          ))}

          {Array.from({ length: ROUNDS_TOTAL }, (_, i) => ({
            round: i + 1,
            tricks: tricksForRound(i + 1),
          })).map((round) => (
            <React.Fragment key={`row-${round.round}`}>
              <div
                className={`p-1 text-center border-b border-r flex flex-col justify-center transition-all duration-200 ${getRoundStateStyles((state.rounds[round.round]?.state ?? 'locked'))}`}
                onClick={() => void cycleRoundState(round.round)}
              >
                <div className="font-bold text-sm text-black">{round.tricks}</div>
                {(() => {
                  const rState = (state.rounds[round.round]?.state ?? 'locked');
                  const showBid = rState === 'bidding' || rState === 'scored';
                  const info = roundInfoByRound[round.round];
                  const total = showBid ? info.sumBids : 0;
                  const mismatch = showBid && total !== info.tricks;
                  const label = showBid ? `Bid: ${total}` : labelForRoundState(rState);
                  return (
                    <div
                      className={`text-[0.55rem] mt-0.5 font-semibold ${mismatch ? 'text-red-700' : ''}`}
                    >
                      {label}
                    </div>
                  );
                })()}
              </div>

              {columns.map((c) => {
                const rState = (state.rounds[round.round]?.state ?? 'locked');
                const bid = c.placeholder ? 0 : (state.rounds[round.round]?.bids[c.id] ?? 0);
                const made = c.placeholder ? null : (state.rounds[round.round]?.made[c.id] ?? null);
                const max = tricksForRound(round.round);
                const cellKey = `${round.round}-${c.id}`;
                const showDetails = rState !== 'scored' ? true : !!detailCells[cellKey];
                return (
                  <div
                    key={`${round.round}-${c.id}`}
                    className={`border-b grid grid-cols-1 ${rState === 'bidding' || rState === 'complete' ? 'grid-rows-1' : showDetails ? 'grid-rows-2' : 'grid-rows-1'} transition-all duration-200 ${getPlayerCellBackgroundStyles(rState)}`}
                    onClick={() => {
                      if (rState === 'scored') toggleCellDetails(round.round, c.id);
                    }}
                  >
                    {c.placeholder ? (
                      <>
                        <div className="border-b flex items-center justify-center px-1 py-0.5">
                          <span className="text-[0.6rem] text-gray-500">-</span>
                        </div>
                        <div className="flex items-center justify-center px-1 py-0.5">
                          <span className="text-[0.6rem] text-gray-500">-</span>
                        </div>
                      </>
                    ) : rState === 'locked' ? (
                      <>
                        <div className="border-b flex items-center justify-center px-1 py-0.5">
                          <span className="text-[0.6rem] text-gray-500">-</span>
                        </div>
                        <div className="flex items-center justify-center px-1 py-0.5">
                          <span className="text-[0.6rem] text-gray-500">-</span>
                        </div>
                      </>
                    ) : rState === 'bidding' ? (
                      <div className="flex items-center justify-center px-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 w-6 p-0 bg-sky-700 hover:bg-sky-800 border-sky-700 text-white"
                          onClick={() => void decrementBid(round.round, c.id)}
                          disabled={bid <= 0}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="text-base leading-none font-bold min-w-[1.5rem] text-center text-black bg-white/60 px-1.5 rounded">
                          {bid}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 w-6 p-0 bg-sky-700 hover:bg-sky-800 border-sky-700 text-white"
                          onClick={() => void incrementBid(round.round, c.id, max)}
                          disabled={bid >= max}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : rState === 'complete' ? (
                      <div className="flex items-center justify-center gap-4 w-full px-1 py-0.5">
                        <Button
                          size="sm"
                          variant={made === true ? 'default' : 'outline'}
                          className="h-5 w-5 p-0 bg-white/80 hover:bg-white border-orange-300"
                          onClick={() => void toggleMade(round.round, c.id, true)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant={made === false ? 'destructive' : 'outline'}
                          className="h-5 w-5 p-0 bg-white/80 hover:bg-white border-orange-300"
                          onClick={() => void toggleMade(round.round, c.id, false)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        {showDetails ? (
                          <>
                            <FitRow
                              className="flex items-center justify-between px-1 py-0.5"
                              maxRem={0.65}
                              minRem={0.5}
                              full={
                                <>
                                  <span className="text-black">Bid: {bid}</span>
                                  <span>
                                    <span className="text-black mr-1">Round:</span>
                                    <span className={`${made ? 'text-green-700' : 'text-red-700'}`}>
                                      {roundDelta(bid, made)}
                                    </span>
                                  </span>
                                </>
                              }
                            />
                            <FitRow
                              className="flex items-center justify-between px-1 py-0.5"
                              maxRem={0.65}
                              minRem={0.5}
                              abbrevAtRem={0.55}
                              full={
                                <>
                                  <span className={`${made ? 'text-emerald-800' : 'text-red-700'}`}>
                                    {made ? 'Made' : 'Missed'}
                                  </span>
                                  {(() => {
                                    const cum = totalsByRound[round.round]?.[c.id] ?? 0;
                                    const isNeg = cum < 0;
                                    return (
                                      <span>
                                        <span className="text-black mr-1">Total:</span>
                                        {isNeg ? (
                                          <span className="relative inline-flex items-center justify-center align-middle w-[2ch] h-[2ch] rounded-full border-2 border-red-500">
                                            <span className="text-red-700 leading-none">
                                              {Math.abs(cum)}
                                            </span>
                                          </span>
                                        ) : (
                                          <span className="text-black">{cum}</span>
                                        )}
                                      </span>
                                    );
                                  })()}
                                </>
                              }
                              abbrev={
                                <>
                                  <span className={`${made ? 'text-emerald-800' : 'text-red-700'}`}>
                                    {made ? 'Made' : 'Missed'}
                                  </span>
                                  {(() => {
                                    const cum = totalsByRound[round.round]?.[c.id] ?? 0;
                                    const isNeg = cum < 0;
                                    return (
                                      <span>
                                        <span className="text-black mr-1">Tot:</span>
                                        {isNeg ? (
                                          <span className="relative inline-flex items-center justify-center align-middle w-[2ch] h-[2ch] rounded-full border-2 border-red-500">
                                            <span className="text-red-700 leading-none">
                                              {Math.abs(cum)}
                                            </span>
                                          </span>
                                        ) : (
                                          <span className="text-black">{cum}</span>
                                        )}
                                      </span>
                                    );
                                  })()}
                                </>
                              }
                            />
                          </>
                        ) : (
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center px-1 py-1 select-none">
                            <span className="w-full text-right font-extrabold text-xl text-black">
                              {bid}
                            </span>
                            <span className="px-1 font-extrabold text-xl text-black">-</span>
                            {(() => {
                              const cum = totalsByRound[round.round]?.[c.id] ?? 0;
                              const isNeg = cum < 0;
                              return (
                                <div className="w-full text-left">
                                  {isNeg ? (
                                    <span className="relative inline-flex items-center justify-center align-middle w-[5ch] h-[5ch] rounded-full border-2 border-red-500">
                                      <span className="font-extrabold text-xl text-red-700 leading-none">
                                        {Math.abs(cum)}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="font-extrabold text-xl text-black">{cum}</span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </Card>
    </div>
  );
}
