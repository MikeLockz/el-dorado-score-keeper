'use client';

import React from 'react';
import { Card, Button, CardGlyph } from '@/components/ui';
import { Check, X, Plus, Minus } from 'lucide-react';
import { useAppState } from '@/components/state-provider';
import { twoCharAbbrs } from '@/lib/utils';
import {
  roundDelta,
  ROUNDS_TOTAL,
  tricksForRound,
  selectCumulativeScoresAllRounds,
  selectRoundInfosAll,
  selectPlayersOrdered,
  type RoundState,
  events,
} from '@/lib/state';

type LiveOverlay = {
  round: number;
  currentPlayerId?: string | null;
  cards: Record<
    string,
    { suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'; rank: number } | null | undefined
  >;
  counts?: Record<string, number>;
};

function labelForRoundState(s: RoundState) {
  return s === 'locked'
    ? 'Locked'
    : s === 'bidding'
      ? 'Active'
      : s === 'playing'
        ? 'Playing'
        : s === 'complete'
          ? 'Complete'
          : 'Scored';
}

function getRoundStateStyles(state: RoundState) {
  switch (state) {
    case 'locked':
      return 'bg-muted text-muted-foreground';
    case 'bidding':
      return 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200';
    case 'playing':
      return 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-200';
    case 'complete':
      return 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200';
    case 'scored':
      return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200';
  }
}

function getPlayerCellBackgroundStyles(state: RoundState) {
  switch (state) {
    case 'locked':
      return 'bg-muted';
    case 'bidding':
      return 'bg-sky-50 dark:bg-sky-900/30';
    case 'playing':
      return 'bg-indigo-50 dark:bg-indigo-900/30';
    case 'complete':
      return 'bg-orange-50 dark:bg-orange-900/30';
    case 'scored':
      return 'bg-emerald-50 dark:bg-emerald-900/30';
  }
}

// (card formatting helpers removed; not used within CurrentGame)

// Shrinks row text to keep everything on a single line without wrapping
function FitRow({
  full,
  abbrev,
  className,
  id,
  maxRem = 0.65,
  minRem = 0.5,
  step = 0.02,
  abbrevAtRem = 0.55,
}: {
  full: React.ReactNode;
  abbrev?: React.ReactNode;
  className?: string;
  id?: string;
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
      id={id}
      ref={ref}
      className={`whitespace-nowrap overflow-hidden ${className ?? ''}`}
      style={{ fontSize: `${size}rem` }}
    >
      {useAbbrev && abbrev ? abbrev : full}
    </div>
  );
}

export default function CurrentGame({
  live,
  biddingInteractiveIds,
  onConfirmBid,
  disableRoundStateCycling,
  disableInputs,
}: {
  live?: LiveOverlay;
  biddingInteractiveIds?: string[];
  onConfirmBid?: (round: number, playerId: string, bid: number) => void;
  disableRoundStateCycling?: boolean;
  disableInputs?: boolean;
} = {}) {
  const { state, append, ready } = useAppState();
  const players = selectPlayersOrdered(state);
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
    if (disableRoundStateCycling) return;
    const current = state.rounds[round]?.state ?? 'locked';
    if (current === 'locked') return;
    if (current === 'bidding') {
      await append(events.roundStateSet({ round, state: 'complete' }));
      return;
    }
    if (current === 'complete') {
      const rd = state.rounds[round];
      const allMarked = players.every(
        (p) => rd?.present?.[p.id] === false || (rd?.made[p.id] ?? null) !== null,
      );
      if (allMarked) {
        await append(events.roundFinalize({ round }));
      }
      return;
    }
    if (current === 'scored') {
      await append(events.roundStateSet({ round, state: 'bidding' }));
    }
  };

  // Compact layout: scale the grid only when screen is too narrow
  const isCompact = columnCount > 4;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const [applyScale, setApplyScale] = React.useState(false);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    const grid = gridRef.current;
    if (!container || !grid) return;

    const ROUND_REM = 3; // row header column
    const COL_REM = 4.75; // each player column

    let raf = 0;
    const fit = () => {
      if (!container) return;
      const cw = container.clientWidth;
      // Compute natural width in px using rem so we can decide without forcing fixed columns
      const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const naturalPx = remPx * (ROUND_REM + COL_REM * columnCount);
      const shouldScale = isCompact && cw < naturalPx;

      if (!shouldScale) {
        setApplyScale(false);
        container.style.height = '';
        if (content) {
          content.style.transform = '';
          content.style.width = '';
        }
        return;
      }

      const next = Math.max(0.5, Math.min(1, cw / naturalPx));
      setApplyScale(true);
      // Maintain correct outer height to avoid clipping when scaled
      container.style.height = `${Math.ceil(grid.scrollHeight * next)}px`;
      if (content) {
        content.style.transform = `scale(${next})`;
        content.style.transformOrigin = 'top left';
        content.style.width = `${ROUND_REM + COL_REM * columnCount}rem`;
      }
    };
    fit();

    const roContainer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    });
    roContainer.observe(container);

    const roGrid = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    });
    roGrid.observe(grid);

    const onOrient = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    };
    window.addEventListener('orientationchange', onOrient);

    return () => {
      cancelAnimationFrame(raf);
      roContainer.disconnect();
      roGrid.disconnect();
      window.removeEventListener('orientationchange', onOrient);
    };
  }, [isCompact, columnCount]);

  return (
    <div className="p-2 mx-auto">
      <Card className="overflow-hidden shadow-none">
        <div ref={containerRef} className="relative w-full overflow-hidden">
          <div ref={contentRef}>
            <div
              ref={gridRef}
              role="grid"
              aria-label="Score grid"
              aria-rowcount={ROUNDS_TOTAL + 1}
              aria-colcount={columnCount + 1}
              className="grid text-[0.65rem] sm:text-xs"
              style={{
                gridTemplateColumns: applyScale
                  ? `3rem repeat(${columnCount}, 4.75rem)`
                  : `3rem repeat(${columnCount}, 1fr)`,
              }}
            >
              <div role="row" aria-rowindex={1} className="contents">
                <div
                  role="columnheader"
                  aria-colindex={1}
                  className="bg-secondary text-secondary-foreground p-1 font-bold text-center border-b border-r outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  tabIndex={0}
                >
                  Rd
                </div>
                {columns.map((c, idx) => (
                  <div
                    key={`hdr-${c.id}`}
                    role="columnheader"
                    aria-colindex={idx + 2}
                    className="bg-secondary text-secondary-foreground p-1 font-bold text-center border-b outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    tabIndex={0}
                    title={c.placeholder ? undefined : c.name}
                    aria-label={c.placeholder ? undefined : `Player ${c.name}`}
                  >
                    {c.placeholder ? '-' : (abbr[c.id] ?? c.name.substring(0, 2))}
                  </div>
                ))}
              </div>

              {Array.from({ length: ROUNDS_TOTAL }, (_, i) => ({
                round: i + 1,
                tricks: tricksForRound(i + 1),
              })).map((round) => (
                <div
                  role="row"
                  aria-rowindex={round.round + 1}
                  className="contents"
                  key={`row-${round.round}`}
                >
                  <div
                    role="rowheader"
                    aria-colindex={1}
                    className={`border-b border-r transition-all duration-200 cursor-pointer ${getRoundStateStyles(state.rounds[round.round]?.state ?? 'locked')}`}
                  >
                    <button
                      type="button"
                      className={`w-full h-full p-1 text-center flex flex-col justify-center outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] ${disableRoundStateCycling ? 'cursor-default' : 'cursor-pointer'}`}
                      onClick={
                        disableRoundStateCycling
                          ? undefined
                          : () => void cycleRoundState(round.round)
                      }
                      aria-label={`Round ${round.round}. ${(() => {
                        const rState = state.rounds[round.round]?.state ?? 'locked';
                        const showBid = rState === 'bidding' || rState === 'scored';
                        const info = roundInfoByRound[round.round] ?? {
                          sumBids: 0,
                          tricks: round.tricks,
                        };
                        const total = showBid ? info.sumBids : 0;
                        const label = showBid ? `Bid: ${total}` : labelForRoundState(rState);
                        return disableRoundStateCycling
                          ? `Current: ${label}.`
                          : `Current: ${label}. Activate to advance state.`;
                      })()}`}
                    >
                      <div className="font-bold text-sm text-foreground">{round.tricks}</div>
                      {(() => {
                        const rState = state.rounds[round.round]?.state ?? 'locked';
                        const showBid = rState === 'bidding' || rState === 'scored';
                        const info = roundInfoByRound[round.round] ?? {
                          sumBids: 0,
                          tricks: round.tricks,
                        };
                        const total = showBid ? info.sumBids : 0;
                        const mismatch = showBid && total !== info.tricks;
                        const label = showBid ? `Bid: ${total}` : labelForRoundState(rState);
                        return (
                          <div
                            className={`text-[0.55rem] mt-0.5 font-semibold ${mismatch ? 'text-red-700 dark:text-red-300' : ''}`}
                          >
                            {label}
                          </div>
                        );
                      })()}
                    </button>
                  </div>

                  {columns.map((c, colIdx) => {
                    const rState = state.rounds[round.round]?.state ?? 'locked';
                    const isAbsent =
                      !c.placeholder && state.rounds[round.round]?.present?.[c.id] === false;
                    const bid =
                      c.placeholder || isAbsent ? 0 : (state.rounds[round.round]?.bids[c.id] ?? 0);
                    const made =
                      c.placeholder || isAbsent
                        ? null
                        : (state.rounds[round.round]?.made[c.id] ?? null);
                    const max = tricksForRound(round.round);
                    const cellKey = `${round.round}-${c.id}`;
                    const showDetails = rState !== 'scored' ? true : !!detailCells[cellKey];
                    const cellKeyId = `cell-details-${round.round}-${c.id}`;
                    const isScored = rState === 'scored';
                    const isLive = rState === 'playing' && live && live.round === round.round;
                    const liveCard = isLive ? live.cards[c.id] : null;
                    const isCurrent = isLive && live.currentPlayerId === c.id;
                    const isRevealWinner = isLive && state.sp?.reveal?.winnerId === c.id;
                    const cellBorder = isRevealWinner
                      ? 'border-2 border-emerald-500'
                      : isCurrent
                        ? 'border-2 border-indigo-500'
                        : 'border-b';
                    return (
                      <div
                        key={`${round.round}-${c.id}`}
                        role="gridcell"
                        aria-colindex={colIdx + 2}
                        className={`${cellBorder} grid grid-cols-1 ${rState === 'bidding' || rState === 'complete' || rState === 'playing' ? 'grid-rows-1' : showDetails ? 'grid-rows-2' : 'grid-rows-1'} transition-all duration-200 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] ${getPlayerCellBackgroundStyles(rState)}`}
                        tabIndex={0}
                        onClick={() => {
                          if (isScored) toggleCellDetails(round.round, c.id);
                        }}
                        {...(isScored
                          ? {
                              onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleCellDetails(round.round, c.id);
                                }
                              },
                              'aria-expanded': showDetails,
                              'aria-controls': cellKeyId,
                              'aria-label': `Toggle score details for ${c.placeholder ? 'player' : c.name} in round ${round.round}`,
                            }
                          : {})}
                        {...(!isScored
                          ? {
                              'aria-label': `Scores for ${c.placeholder ? 'player' : c.name} in round ${round.round}`,
                            }
                          : {})}
                      >
                        {c.placeholder || isAbsent ? (
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
                          (() => {
                            const canBid =
                              !biddingInteractiveIds || biddingInteractiveIds.includes(c.id);
                            if (!canBid) {
                              return (
                                <div className="flex items-center justify-center px-1">
                                  <span className="text-base leading-none font-bold min-w-[1.5rem] text-center text-foreground bg-secondary/50 dark:bg-secondary/20 px-1.5 rounded">
                                    {bid}
                                  </span>
                                </div>
                              );
                            }
                            return (
                              <div className="flex items-center justify-center px-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 w-6 p-0 bg-sky-700 hover:bg-sky-800 dark:bg-sky-700 dark:hover:bg-sky-600 border-sky-700 dark:border-sky-600 text-white"
                                  onClick={() => void decrementBid(round.round, c.id)}
                                  aria-label={`Decrease bid for ${c.name} in round ${round.round}`}
                                  disabled={disableInputs || bid <= 0}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="text-base leading-none font-bold min-w-[1.5rem] text-center text-foreground bg-secondary/70 dark:bg-secondary/30 px-1.5 rounded">
                                  {bid}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 w-6 p-0 bg-sky-700 hover:bg-sky-800 dark:bg-sky-700 dark:hover:bg-sky-600 border-sky-700 dark:border-sky-600 text-white"
                                  onClick={() => void incrementBid(round.round, c.id, max)}
                                  aria-label={`Increase bid for ${c.name} in round ${round.round}`}
                                  disabled={disableInputs || bid >= max}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                                {onConfirmBid ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 w-6 p-0 ml-1 bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-700 dark:hover:bg-emerald-600 border-emerald-700 dark:border-emerald-600 text-white"
                                    onClick={() => onConfirmBid(round.round, c.id, bid)}
                                    aria-label={`Confirm bid for ${c.name} and start round`}
                                    disabled={disableInputs}
                                  >
                                    <Check className="h-3 w-3" />
                                  </Button>
                                ) : null}
                              </div>
                            );
                          })()
                        ) : rState === 'playing' ? (
                          <div
                            id={cellKeyId}
                            className="grid grid-cols-[1fr_auto_1fr] items-center px-1 py-1 select-none"
                          >
                            {(() => {
                              const taken = live?.counts?.[c.id] ?? 0;
                              return (
                                <span className="w-full text-right font-extrabold text-xl text-foreground">
                                  {taken}/{bid}
                                </span>
                              );
                            })()}
                            <span className="px-1 font-extrabold text-xl text-foreground">-</span>
                            <span className="w-full text-left">
                              {liveCard ? (
                                <CardGlyph suit={liveCard.suit} rank={liveCard.rank} size="md" />
                              ) : (
                                <span className="text-[0.9rem] text-muted-foreground">—</span>
                              )}
                            </span>
                          </div>
                        ) : rState === 'complete' ? (
                          <div className="flex items-center justify-center gap-4 w-full px-1 py-0.5">
                            <Button
                              size="sm"
                              variant={made === true ? 'default' : 'outline'}
                              className="h-5 w-5 p-0 bg-white/80 hover:bg-white border-orange-300"
                              onClick={() => void toggleMade(round.round, c.id, true)}
                              aria-pressed={made === true}
                              aria-label={`Mark made for ${c.name} in round ${round.round}`}
                              disabled={disableInputs}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant={made === false ? 'destructive' : 'outline'}
                              className="h-5 w-5 p-0 bg-white/80 hover:bg-white border-orange-300"
                              onClick={() => void toggleMade(round.round, c.id, false)}
                              aria-pressed={made === false}
                              aria-label={`Mark missed for ${c.name} in round ${round.round}`}
                              disabled={disableInputs}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            {showDetails ? (
                              <>
                                <FitRow
                                  id={cellKeyId}
                                  className="flex items-center justify-between px-1 py-0.5"
                                  maxRem={0.65}
                                  minRem={0.5}
                                  full={
                                    <>
                                      <span className="text-foreground">Bid: {bid}</span>
                                      <span>
                                        <span className="text-foreground mr-1">Round:</span>
                                        <span
                                          className={`${made ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}
                                        >
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
                                      <span
                                        className={`${made ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}
                                      >
                                        {made ? 'Made' : 'Missed'}
                                      </span>
                                      {(() => {
                                        const cum = totalsByRound[round.round]?.[c.id] ?? 0;
                                        const isNeg = cum < 0;
                                        return (
                                          <span>
                                            <span className="text-foreground mr-1">Total:</span>
                                            {isNeg ? (
                                              <span className="relative inline-flex items-center justify-center align-middle w-[2ch] h-[2ch] rounded-full border-2 border-red-500">
                                                <span className="text-red-700 dark:text-red-300 leading-none">
                                                  {Math.abs(cum)}
                                                </span>
                                              </span>
                                            ) : (
                                              <span className="text-foreground">{cum}</span>
                                            )}
                                          </span>
                                        );
                                      })()}
                                    </>
                                  }
                                  abbrev={
                                    <>
                                      <span
                                        className={`${made ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}
                                      >
                                        {made ? 'Made' : 'Missed'}
                                      </span>
                                      {(() => {
                                        const cum = totalsByRound[round.round]?.[c.id] ?? 0;
                                        const isNeg = cum < 0;
                                        return (
                                          <span>
                                            <span className="text-foreground mr-1">Tot:</span>
                                            {isNeg ? (
                                              <span className="relative inline-flex items-center justify-center align-middle w-[2ch] h-[2ch] rounded-full border-2 border-red-500">
                                                <span className="text-red-700 dark:text-red-300 leading-none">
                                                  {Math.abs(cum)}
                                                </span>
                                              </span>
                                            ) : (
                                              <span className="text-foreground">{cum}</span>
                                            )}
                                          </span>
                                        );
                                      })()}
                                    </>
                                  }
                                />
                              </>
                            ) : (
                              <div
                                id={cellKeyId}
                                className="grid grid-cols-[1fr_auto_1fr] items-center px-1 py-1 select-none"
                              >
                                <span className="w-full text-right font-extrabold text-xl text-foreground">
                                  {bid}
                                </span>
                                <span className="px-1 font-extrabold text-xl text-foreground">
                                  -
                                </span>
                                {(() => {
                                  const cum = totalsByRound[round.round]?.[c.id] ?? 0;
                                  const isNeg = cum < 0;
                                  return (
                                    <div className="w-full text-left">
                                      {isNeg ? (
                                        <span className="relative inline-flex items-center justify-center align-middle w-[4ch] h-[4ch] rounded-full border-2 border-red-500">
                                          <span className="font-extrabold text-lg text-red-700 dark:text-red-300 leading-none">
                                            {Math.abs(cum)}
                                          </span>
                                        </span>
                                      ) : (
                                        <span className="font-extrabold text-xl text-foreground">
                                          {cum}
                                        </span>
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
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
