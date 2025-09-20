'use client';

import React from 'react';
import { Card, Button, CardGlyph } from '@/components/ui';
import { Check, X, Plus, Minus } from 'lucide-react';
import { roundDelta, ROUNDS_TOTAL } from '@/lib/state';
import type { RoundState } from '@/lib/state';
import { twoCharAbbrs } from '@/lib/utils';

type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

export type LiveOverlay = {
  round: number;
  currentPlayerId?: string | null;
  cards: Record<string, { suit: Suit; rank: number } | null | undefined>;
  counts?: Record<string, number>;
};

export type ScorecardPlayerColumn = {
  id: string;
  name: string;
  placeholder?: boolean;
};

export type ScorecardRoundInfo = {
  sumBids: number;
  overUnder: 'match' | 'over' | 'under';
  showBidChip: boolean;
};

export type ScorecardRoundEntry = {
  bid: number;
  made: boolean | null;
  present: boolean;
  cumulative: number;
  placeholder?: boolean;
  taken?: number | null;
  liveCard?: { suit: Suit; rank: number } | null;
};

export type ScorecardRoundView = {
  round: number;
  tricks: number;
  state: RoundState;
  info: ScorecardRoundInfo;
  entries: Record<string, ScorecardRoundEntry>;
};

export type ScorecardGridProps = {
  columns: ReadonlyArray<ScorecardPlayerColumn>;
  rounds: ReadonlyArray<ScorecardRoundView>;
  live?: LiveOverlay | null;
  revealWinnerId?: string | null;
  biddingInteractiveIds?: ReadonlyArray<string>;
  disableRoundStateCycling?: boolean;
  disableInputs?: boolean;
  onCycleRoundState?: (round: number) => void;
  onIncrementBid?: (round: number, playerId: string, max: number) => void;
  onDecrementBid?: (round: number, playerId: string) => void;
  onToggleMade?: (round: number, playerId: string, desired: boolean) => void;
  onConfirmBid?: (round: number, playerId: string, bid: number) => void;
};

function labelForRoundState(state: RoundState) {
  switch (state) {
    case 'locked':
      return 'Locked';
    case 'bidding':
      return 'Active';
    case 'playing':
      return 'Playing';
    case 'complete':
      return 'Done';
    case 'scored':
      return 'Scored';
    default:
      return 'Locked';
  }
}

function getRoundStateStyles(state: RoundState) {
  switch (state) {
    case 'locked':
      return 'bg-status-locked text-status-locked-foreground';
    case 'bidding':
      return 'bg-status-bidding text-status-bidding-foreground';
    case 'playing':
      return 'bg-status-playing text-status-playing-foreground';
    case 'complete':
      return 'bg-status-complete text-status-complete-foreground';
    case 'scored':
      return 'bg-status-scored text-status-scored-foreground';
    default:
      return 'bg-status-locked text-status-locked-foreground';
  }
}

function getPlayerCellBackgroundStyles(state: RoundState) {
  switch (state) {
    case 'locked':
      return 'bg-status-locked-surface';
    case 'bidding':
      return 'bg-status-bidding-surface';
    case 'playing':
      return 'bg-status-playing-surface';
    case 'complete':
      return 'bg-status-complete-surface';
    case 'scored':
      return 'bg-status-scored-surface';
    default:
      return 'bg-status-locked-surface';
  }
}

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
      while (
        (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) &&
        current > minRem
      ) {
        current = Math.max(minRem, current - step);
        el.style.fontSize = `${current}rem`;
      }
      setSize(current);
      if (!useAbbrev && abbrev && current <= abbrevAtRem) {
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

export default function ScorecardGrid({
  columns,
  rounds,
  live,
  revealWinnerId,
  biddingInteractiveIds,
  disableRoundStateCycling,
  disableInputs,
  onCycleRoundState,
  onIncrementBid,
  onDecrementBid,
  onToggleMade,
  onConfirmBid,
}: ScorecardGridProps) {
  const detailCells = React.useRef<Record<string, boolean>>({});
  const [, forceDetailRender] = React.useReducer((n) => n + 1, 0);
  const toggleCellDetails = React.useCallback((roundNum: number, playerId: string) => {
    const key = `${roundNum}-${playerId}`;
    detailCells.current[key] = !detailCells.current[key];
    forceDetailRender();
  }, []);

  const columnCount = columns.length;
  const abbr = React.useMemo(() => {
    const players = columns.filter((c) => !c.placeholder).map((c) => ({ id: c.id, name: c.name }));
    return twoCharAbbrs(players);
  }, [columns]);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const [applyScale, setApplyScale] = React.useState(false);
  const isCompact = columnCount > 4;

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    const grid = gridRef.current;
    if (!container || !grid) return;

    const ROUND_REM = 3;
    const COL_REM = 4.75;

    let raf = 0;
    const fit = () => {
      if (!container) return;
      const cw = container.clientWidth;
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

  const biddingSet = React.useMemo(() => {
    if (!biddingInteractiveIds) return null;
    return new Set(biddingInteractiveIds);
  }, [biddingInteractiveIds]);

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
                {columns.map((column, idx) => (
                  <div
                    key={`hdr-${column.id}`}
                    role="columnheader"
                    aria-colindex={idx + 2}
                    className="bg-secondary text-secondary-foreground p-1 font-bold text-center border-b outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    tabIndex={0}
                    title={column.placeholder ? undefined : column.name}
                    aria-label={column.placeholder ? undefined : `Player ${column.name}`}
                  >
                    {column.placeholder ? '-' : abbr[column.id] ?? column.name.substring(0, 2)}
                  </div>
                ))}
              </div>

              {rounds.map((round, rowIdx) => (
                <div
                  role="row"
                  aria-rowindex={rowIdx + 2}
                  className="contents"
                  key={`row-${round.round}`}
                >
                  <div
                    role="rowheader"
                    aria-colindex={1}
                    className={`border-b border-r transition-all duration-200 ${
                      disableRoundStateCycling ? 'cursor-default' : 'cursor-pointer'
                    } ${getRoundStateStyles(round.state)}`}
                  >
                    <button
                      type="button"
                      className="w-full h-full p-1 text-center flex flex-col justify-center outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                      onClick={
                        disableRoundStateCycling || !onCycleRoundState
                          ? undefined
                          : () => onCycleRoundState(round.round)
                      }
                      aria-label={`Round ${round.round}. ${(() => {
                        const showBid = round.info.showBidChip;
                        const label = showBid
                          ? `Bid: ${round.info.sumBids} (${round.info.overUnder === 'match' ? 'matches tricks' : round.info.overUnder === 'over' ? 'over bid' : 'under bid'})`
                          : labelForRoundState(round.state);
                        return disableRoundStateCycling
                          ? `Current: ${label}.`
                          : `Current: ${label}. Activate to advance state.`;
                      })()}`}
                    >
                      <div className="font-bold text-sm text-foreground">{round.tricks}</div>
                      {round.info.showBidChip ? (
                        <div className="mt-0.5 flex justify-center">
                          <span
                            className={`inline-flex items-center rounded-full px-1 py-[1px] text-[0.55rem] whitespace-nowrap ${
                              round.info.overUnder === 'match'
                                ? 'bg-status-scored text-white'
                                : 'bg-destructive text-white'
                            }`}
                          >
                            {`Bid: ${round.info.sumBids}`}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[0.55rem] mt-0.5 font-semibold">
                          {labelForRoundState(round.state)}
                        </div>
                      )}
                    </button>
                  </div>

                  {columns.map((column, colIdx) => {
                    const entry = round.entries[column.id];
                    const cellKey = `${round.round}-${column.id}`;
                    const showDetails =
                      round.state !== 'scored'
                        ? true
                        : !!detailCells.current[cellKey];
                    const cellKeyId = `cell-details-${round.round}-${column.id}`;
                    const isScored = round.state === 'scored';
                    const isLive =
                      round.state === 'playing' && live && live.round === round.round;
                    const liveCard = isLive ? live.cards[column.id] ?? null : null;
                    const isCurrent =
                      isLive && live?.currentPlayerId && live.currentPlayerId === column.id;
                    const isRevealWinner = isLive && revealWinnerId === column.id;
                    const cellBorder = isRevealWinner
                      ? 'border-2 border-status-scored'
                      : isCurrent
                        ? 'border-2 border-status-playing'
                        : 'border-b';

                    const isPlaceholder = column.placeholder || entry?.placeholder;
                    const isAbsent = !isPlaceholder && entry && !entry.present;
                    const bid = entry?.bid ?? 0;
                    const made = entry?.made ?? null;
                    const cumulative = entry?.cumulative ?? 0;
                    const taken = entry?.taken ?? null;

                    return (
                      <div
                        key={`${round.round}-${column.id}`}
                        role="gridcell"
                        aria-colindex={colIdx + 2}
                        className={`${cellBorder} grid grid-cols-1 ${
                          round.state === 'bidding' ||
                          round.state === 'complete' ||
                          round.state === 'playing'
                            ? 'grid-rows-1'
                            : showDetails
                              ? 'grid-rows-2'
                              : 'grid-rows-1'
                        } transition-all duration-200 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] ${getPlayerCellBackgroundStyles(round.state)}`}
                        tabIndex={0}
                        onClick={() => {
                          if (isScored && !isPlaceholder && !isAbsent) {
                            toggleCellDetails(round.round, column.id);
                          }
                        }}
                        {...(isScored && !isPlaceholder && !isAbsent
                          ? {
                              onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleCellDetails(round.round, column.id);
                                }
                              },
                              'aria-expanded': showDetails,
                              'aria-controls': cellKeyId,
                              'aria-label': `Toggle score details for ${column.name} in round ${round.round}`,
                            }
                          : {
                              'aria-label': `Scores for ${column.placeholder ? 'player' : column.name} in round ${round.round}`,
                            })}
                      >
                        {isPlaceholder || isAbsent ? (
                          <>
                            <div className="border-b flex items-center justify-center px-1 py-0.5">
                              <span className="text-[0.6rem] text-surface-muted-foreground">-</span>
                            </div>
                            <div className="flex items-center justify-center px-1 py-0.5">
                              <span className="text-[0.6rem] text-surface-muted-foreground">-</span>
                            </div>
                          </>
                        ) : round.state === 'locked' ? (
                          <>
                            <div className="border-b flex items-center justify-center px-1 py-0.5">
                              <span className="text-[0.6rem] text-surface-muted-foreground">-</span>
                            </div>
                            <div className="flex items-center justify-center px-1 py-0.5">
                              <span className="text-[0.6rem] text-surface-muted-foreground">-</span>
                            </div>
                          </>
                        ) : round.state === 'bidding' ? (
                          (() => {
                            const canBid = !biddingSet || biddingSet.has(column.id);
                            if (!canBid) {
                              return (
                                <div className="flex items-center justify-center px-1">
                                  <span className="text-base leading-none font-bold min-w-[1.5rem] text-center text-status-bidding-foreground bg-status-bidding-surface px-1.5 rounded">
                                    {bid}
                                  </span>
                                </div>
                              );
                            }
                            const handleDec = () => {
                              if (disableInputs || !onDecrementBid) return;
                              onDecrementBid(round.round, column.id);
                            };
                            const handleInc = () => {
                              if (disableInputs || !onIncrementBid) return;
                              onIncrementBid(round.round, column.id, round.tricks);
                            };
                            const handleConfirm = () => {
                              if (disableInputs || !onConfirmBid) return;
                              onConfirmBid(round.round, column.id, bid);
                            };
                            return (
                              <div className="flex items-center justify-center px-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 w-6 p-0 border border-status-bidding bg-status-bidding text-status-bidding-foreground hover:bg-[color-mix(in_oklch,_var(--color-status-bidding)_90%,_black_10%)] focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                                  onClick={handleDec}
                                  aria-label={`Decrease bid for ${column.name} in round ${round.round}`}
                                  disabled={disableInputs || bid <= 0}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="text-base leading-none font-bold min-w-[1.5rem] text-center text-status-bidding-foreground px-1.5 rounded">
                                  {bid}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 w-6 p-0 border border-status-bidding bg-status-bidding text-status-bidding-foreground hover:bg-[color-mix(in_oklch,_var(--color-status-bidding)_90%,_black_10%)] focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                                  onClick={handleInc}
                                  aria-label={`Increase bid for ${column.name} in round ${round.round}`}
                                  disabled={disableInputs || bid >= round.tricks}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                                {onConfirmBid ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 w-6 p-0 ml-1 border border-status-scored bg-status-scored text-status-scored-foreground hover:bg-[color-mix(in_oklch,_var(--color-status-scored)_88%,_black_12%)] focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                                    onClick={handleConfirm}
                                    aria-label={`Confirm bid for ${column.name} and start round`}
                                    disabled={disableInputs}
                                  >
                                    <Check className="h-3 w-3" />
                                  </Button>
                                ) : null}
                              </div>
                            );
                          })()
                        ) : round.state === 'playing' ? (
                          <div
                            id={cellKeyId}
                            className="grid grid-cols-[1fr_auto_1fr] items-center px-1 py-1 select-none"
                          >
                            <span className="w-full text-right font-extrabold text-xl text-foreground">
                              {taken ?? 0}/{bid}
                            </span>
                            <span className="px-1 font-extrabold text-xl text-foreground">-</span>
                            <span className="w-full text-left">
                              {liveCard ? (
                                <CardGlyph suit={liveCard.suit} rank={liveCard.rank} size="md" />
                              ) : (
                                <span className="text-[0.9rem] text-muted-foreground">—</span>
                              )}
                            </span>
                          </div>
                        ) : round.state === 'complete' ? (
                          <div className="flex items-center justify-center gap-4 w-full px-1 py-0.5">
                            <button
                              type="button"
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-md border p-0 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 ${
                                made === true
                                  ? 'border-status-scored bg-status-scored text-status-scored-foreground hover:bg-[color-mix(in_oklch,_var(--color-status-scored)_85%,_black_15%)]'
                                  : 'border-border bg-card/70 text-muted-foreground hover:bg-card dark:bg-surface-muted/80 dark:text-surface-muted-foreground'
                              }`}
                              onClick={() => {
                                if (disableInputs || !onToggleMade) return;
                                onToggleMade(round.round, column.id, true);
                              }}
                              aria-pressed={made === true}
                              aria-label={`Mark made for ${column.name} in round ${round.round}`}
                              disabled={disableInputs}
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-md border p-0 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 ${
                                made === false
                                  ? 'border-destructive bg-destructive text-white hover:bg-[color-mix(in_oklch,_var(--destructive)_85%,_black_15%)] dark:text-white'
                                  : 'border-border bg-card/70 text-muted-foreground hover:bg-card dark:bg-surface-muted/80 dark:text-surface-muted-foreground'
                              }`}
                              onClick={() => {
                                if (disableInputs || !onToggleMade) return;
                                onToggleMade(round.round, column.id, false);
                              }}
                              aria-pressed={made === false}
                              aria-label={`Mark missed for ${column.name} in round ${round.round}`}
                              disabled={disableInputs}
                            >
                              <X className="h-3 w-3" />
                            </button>
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
                                          className={`${made ? 'text-status-scored' : 'text-destructive'}`}
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
                                        className={`${made ? 'text-status-scored' : 'text-destructive'}`}
                                      >
                                        {made ? 'Made' : 'Missed'}
                                      </span>
                                      <span>
                                        <span className="text-foreground mr-1">Total:</span>
                                        {cumulative < 0 ? (
                                          <span className="relative inline-flex items-center justify-center align-middle w-[2ch] h-[2ch] rounded-full border-2 border-destructive">
                                            <span className="text-destructive leading-none">
                                              {Math.abs(cumulative)}
                                            </span>
                                          </span>
                                        ) : (
                                          <span className="text-foreground">{cumulative}</span>
                                        )}
                                      </span>
                                    </>
                                  }
                                  abbrev={
                                    <>
                                      <span
                                        className={`${made ? 'text-status-scored' : 'text-destructive'}`}
                                      >
                                        {made ? 'Made' : 'Missed'}
                                      </span>
                                      <span>
                                        <span className="text-foreground mr-1">Tot:</span>
                                        {cumulative < 0 ? (
                                          <span className="relative inline-flex items-center justify-center align-middle w-[2ch] h-[2ch] rounded-full border-2 border-destructive">
                                            <span className="text-destructive leading-none">
                                              {Math.abs(cumulative)}
                                            </span>
                                          </span>
                                        ) : (
                                          <span className="text-foreground">{cumulative}</span>
                                        )}
                                      </span>
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
                                <span className="px-1 font-extrabold text-xl text-foreground">-</span>
                                <div className="w-full text-left">
                                  {cumulative < 0 ? (
                                    <span className="relative inline-flex items-center justify-center align-middle w-[4ch] h-[4ch] rounded-full border-2 border-destructive">
                                      <span className="font-extrabold text-lg text-destructive leading-none">
                                        {Math.abs(cumulative)}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="font-extrabold text-xl text-foreground">{cumulative}</span>
                                  )}
                                </div>
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
