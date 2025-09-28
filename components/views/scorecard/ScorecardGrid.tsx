'use client';

import React from 'react';
import clsx from 'clsx';

import { Card, Button, CardGlyph } from '@/components/ui';
import { Check, X, Plus, Minus } from 'lucide-react';
import { roundDelta, ROUNDS_TOTAL } from '@/lib/state';
import type { RoundState } from '@/lib/state';
import { twoCharAbbrs } from '@/lib/utils';

import styles from './scorecard-grid.module.scss';

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

function getRoundStateClass(state: RoundState) {
  switch (state) {
    case 'locked':
      return styles.roundStateLocked;
    case 'bidding':
      return styles.roundStateBidding;
    case 'playing':
      return styles.roundStatePlaying;
    case 'complete':
      return styles.roundStateComplete;
    case 'scored':
      return styles.roundStateScored;
    default:
      return styles.roundStateLocked;
  }
}

function getPlayerCellBackgroundClass(state: RoundState) {
  switch (state) {
    case 'locked':
      return styles.playerCellLocked;
    case 'bidding':
      return styles.playerCellBidding;
    case 'playing':
      return styles.playerCellPlaying;
    case 'complete':
      return styles.playerCellComplete;
    case 'scored':
      return styles.playerCellScored;
    default:
      return styles.playerCellLocked;
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
      className={clsx(styles.fitRow, className)}
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
    <div className={styles.wrapper}>
      <Card className={styles.card}>
        <div ref={containerRef} className={styles.scaleContainer}>
          <div ref={contentRef} className={styles.gridWrapper}>
            <div
              ref={gridRef}
              role="grid"
              aria-label="Score grid"
              aria-rowcount={ROUNDS_TOTAL + 1}
              aria-colcount={columnCount + 1}
              className={styles.grid}
              style={{
                gridTemplateColumns: applyScale
                  ? `3rem repeat(${columnCount}, 4.75rem)`
                  : `3rem repeat(${columnCount}, 1fr)`,
              }}
            >
              <div role="row" aria-rowindex={1} className={styles.gridRow}>
                <div
                  role="columnheader"
                  aria-colindex={1}
                  className={clsx(styles.headerCell, styles.headerCellRound)}
                  tabIndex={0}
                >
                  Rd
                </div>
                {columns.map((column, idx) => (
                  <div
                    key={`hdr-${column.id}`}
                    role="columnheader"
                    aria-colindex={idx + 2}
                    className={styles.headerCell}
                    tabIndex={0}
                    title={column.placeholder ? undefined : column.name}
                    aria-label={column.placeholder ? undefined : `Player ${column.name}`}
                  >
                    {column.placeholder ? '-' : (abbr[column.id] ?? column.name.substring(0, 2))}
                  </div>
                ))}
              </div>

              {rounds.map((round, rowIdx) => (
                <div
                  role="row"
                  aria-rowindex={rowIdx + 2}
                  className={styles.gridRow}
                  key={`row-${round.round}`}
                >
                  <div
                    role="rowheader"
                    aria-colindex={1}
                    className={clsx(
                      styles.roundCell,
                      disableRoundStateCycling ? undefined : styles.cellToggleSummary,
                      getRoundStateClass(round.state),
                    )}
                  >
                    <button
                      type="button"
                      className={styles.roundStateButton}
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
                      <div className={styles.roundStateValue}>{round.tricks}</div>
                      {round.info.showBidChip ? (
                        <div className={styles.roundStateMeta}>
                          <span
                            className={clsx(
                              styles.roundBidChip,
                              round.info.overUnder === 'match'
                                ? styles.roundBidChipMatch
                                : styles.roundBidChipMiss,
                            )}
                          >
                            {`Bid: ${round.info.sumBids}`}
                          </span>
                        </div>
                      ) : (
                        <div className={styles.roundStateMeta}>
                          <div className={styles.roundStateLabel}>
                            {labelForRoundState(round.state)}
                          </div>
                        </div>
                      )}
                    </button>
                  </div>

                  {columns.map((column, colIdx) => {
                    const entry = round.entries[column.id];
                    const cellKey = `${round.round}-${column.id}`;
                    const showDetails =
                      round.state !== 'scored' ? true : !!detailCells.current[cellKey];
                    const cellKeyId = `cell-details-${round.round}-${column.id}`;
                    const isScored = round.state === 'scored';
                    const isLive = round.state === 'playing' && live && live.round === round.round;
                    const liveCard = isLive ? (live.cards[column.id] ?? null) : null;
                    const isCurrent =
                      isLive && live?.currentPlayerId && live.currentPlayerId === column.id;
                    const isRevealWinner = isLive && revealWinnerId === column.id;
                    const cellBorderClass = isRevealWinner
                      ? styles.cellBorderWinner
                      : isCurrent
                        ? styles.cellBorderCurrent
                        : styles.cellBorderDefault;

                    const isPlaceholder = column.placeholder || entry?.placeholder;
                    const isAbsent = !isPlaceholder && entry && !entry.present;
                    const bid = entry?.bid ?? 0;
                    const made = entry?.made ?? null;
                    const cumulative = entry?.cumulative ?? 0;
                    const taken = entry?.taken ?? null;

                    const isClickable = isScored && !isPlaceholder && !isAbsent;
                    const playerCellClass = clsx(
                      cellBorderClass,
                      styles.playerCell,
                      round.state === 'bidding' ||
                        round.state === 'complete' ||
                        round.state === 'playing' ||
                        !showDetails
                        ? styles.playerCellSingleRow
                        : styles.playerCellDoubleRow,
                      getPlayerCellBackgroundClass(round.state),
                      isClickable ? styles.cellToggleSummary : undefined,
                    );

                    const renderPlaceholderRows = () => (
                      <>
                        <div className={styles.playerCellPlaceholderRow}>
                          <span className={styles.placeholderValue}>-</span>
                        </div>
                        <div className={styles.playerCellInfoRow}>
                          <span className={styles.placeholderValue}>-</span>
                        </div>
                      </>
                    );

                    let cellContent: React.ReactNode;

                    if (isPlaceholder || isAbsent || round.state === 'locked') {
                      cellContent = renderPlaceholderRows();
                    } else if (round.state === 'bidding') {
                      const canBid = !biddingSet || biddingSet.has(column.id);
                      if (!canBid) {
                        cellContent = (
                          <div className={styles.biddingDisplay}>
                            <span className={styles.biddingChip}>{bid}</span>
                          </div>
                        );
                      } else {
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
                        cellContent = (
                          <div className={styles.biddingControls}>
                            <Button
                              size="sm"
                              variant="outline"
                              className={styles.bidAdjustButton}
                              onClick={handleDec}
                              aria-label={`Decrease bid for ${column.name} in round ${round.round}`}
                              disabled={disableInputs || bid <= 0}
                            >
                              <Minus className={styles.bidButtonIcon} />
                            </Button>
                            <span className={styles.biddingChip}>{bid}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className={styles.bidAdjustButton}
                              onClick={handleInc}
                              aria-label={`Increase bid for ${column.name} in round ${round.round}`}
                              disabled={disableInputs || bid >= round.tricks}
                            >
                              <Plus className={styles.bidButtonIcon} />
                            </Button>
                            {onConfirmBid ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className={styles.bidConfirmButton}
                                onClick={handleConfirm}
                                aria-label={`Confirm bid for ${column.name} and start round`}
                                disabled={disableInputs}
                              >
                                <Check className={styles.bidButtonIcon} />
                              </Button>
                            ) : null}
                          </div>
                        );
                      }
                    } else if (round.state === 'playing') {
                      cellContent = (
                        <div id={cellKeyId} className={styles.playingCell}>
                          <span className={styles.playingBidTaken}>{`${taken ?? 0}/${bid}`}</span>
                          <span className={styles.playingSeparator}>-</span>
                          <span className={styles.playingCardWrapper}>
                            {liveCard ? (
                              <CardGlyph suit={liveCard.suit} rank={liveCard.rank} size="md" />
                            ) : (
                              <span className={styles.playingCardEmpty}>—</span>
                            )}
                          </span>
                        </div>
                      );
                    } else if (round.state === 'complete') {
                      cellContent = (
                        <div className={styles.completeControls}>
                          <button
                            type="button"
                            className={clsx(
                              styles.toggleButton,
                              made === true && styles.toggleButtonMade,
                            )}
                            onClick={() => {
                              if (disableInputs || !onToggleMade) return;
                              onToggleMade(round.round, column.id, true);
                            }}
                            aria-pressed={made === true}
                            aria-label={`Mark made for ${column.name} in round ${round.round}`}
                            disabled={disableInputs}
                          >
                            <Check className={styles.inlineIcon} />
                          </button>
                          <button
                            type="button"
                            className={clsx(
                              styles.toggleButton,
                              made === false && styles.toggleButtonMiss,
                            )}
                            onClick={() => {
                              if (disableInputs || !onToggleMade) return;
                              onToggleMade(round.round, column.id, false);
                            }}
                            aria-pressed={made === false}
                            aria-label={`Mark missed for ${column.name} in round ${round.round}`}
                            disabled={disableInputs}
                          >
                            <X className={styles.inlineIcon} />
                          </button>
                        </div>
                      );
                    } else {
                      cellContent = showDetails ? (
                        <>
                          <FitRow
                            id={cellKeyId}
                            className={styles.detailRow}
                            maxRem={0.65}
                            minRem={0.5}
                            full={
                              <>
                                <span className={styles.detailLabel}>Bid: {bid}</span>
                                <span className={styles.detailTotalWrapper}>
                                  <span className={styles.detailLabel}>Round:</span>
                                  <span
                                    className={clsx(
                                      made
                                        ? styles.detailBadgePositive
                                        : styles.detailBadgeNegative,
                                    )}
                                  >
                                    {roundDelta(bid, made)}
                                  </span>
                                </span>
                              </>
                            }
                          />
                          <FitRow
                            className={styles.detailRow}
                            maxRem={0.65}
                            minRem={0.5}
                            abbrevAtRem={0.55}
                            full={
                              <>
                                <span
                                  className={clsx(
                                    made ? styles.detailBadgePositive : styles.detailBadgeNegative,
                                  )}
                                >
                                  {made ? 'Made' : 'Missed'}
                                </span>
                                <span className={styles.detailTotalWrapper}>
                                  <span className={styles.detailLabel}>Total:</span>
                                  {cumulative < 0 ? (
                                    <span className={styles.cellSummaryTotalNegative}>
                                      {Math.abs(cumulative)}
                                    </span>
                                  ) : (
                                    <span className={styles.detailBadgeNeutral}>{cumulative}</span>
                                  )}
                                </span>
                              </>
                            }
                            abbrev={
                              <>
                                <span
                                  className={clsx(
                                    made ? styles.detailBadgePositive : styles.detailBadgeNegative,
                                  )}
                                >
                                  {made ? 'Made' : 'Missed'}
                                </span>
                                <span className={styles.detailTotalWrapper}>
                                  <span className={styles.detailLabel}>Tot:</span>
                                  {cumulative < 0 ? (
                                    <span className={styles.cellSummaryTotalNegative}>
                                      {Math.abs(cumulative)}
                                    </span>
                                  ) : (
                                    <span className={styles.detailBadgeNeutral}>{cumulative}</span>
                                  )}
                                </span>
                              </>
                            }
                          />
                        </>
                      ) : (
                        <div id={cellKeyId} className={styles.cellSummary}>
                          <span className={styles.cellSummaryValue}>{bid}</span>
                          <span className={styles.cellSummarySeparator}>-</span>
                          <div className={styles.playingCardWrapper}>
                            {cumulative < 0 ? (
                              <span className={styles.cellSummaryTotalNegative}>
                                {Math.abs(cumulative)}
                              </span>
                            ) : (
                              <span className={styles.cellSummaryTotal}>{cumulative}</span>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`${round.round}-${column.id}`}
                        role="gridcell"
                        aria-colindex={colIdx + 2}
                        className={playerCellClass}
                        tabIndex={0}
                        onClick={() => {
                          if (isClickable) {
                            toggleCellDetails(round.round, column.id);
                          }
                        }}
                        {...(isClickable
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
                        {cellContent}
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
