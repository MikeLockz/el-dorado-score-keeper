'use client';

import React from 'react';
import clsx from 'clsx';
import { HeatmapRect, type RectCell } from '@visx/heatmap';
import { scaleBand, scaleLinear } from '@visx/scale';
import { TooltipWithBounds, useTooltip } from '@visx/tooltip';

import type { RoundMetric } from '@/lib/state/player-statistics';

import styles from './RoundAccuracyChart.module.scss';

export type RoundAccuracyChartProps = Readonly<{
  metrics: ReadonlyArray<RoundMetric>;
  loading: boolean;
  loadError?: string | null;
}>;

type HeatmapColumn = RoundMetric;
type HeatmapBin = RoundMetric;

type TooltipPayload = Readonly<{
  metric: RoundMetric;
  value: number | null;
}>;

const percentFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const integerFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

const margin = { top: 12, right: 16, bottom: 40, left: 16 };
const chartHeight = 132;
const fallbackWidth = 360;

export function RoundAccuracyChart({
  metrics,
  loading,
  loadError,
}: RoundAccuracyChartProps): JSX.Element {
  const data = React.useMemo(() => metrics ?? [], [metrics]);
  const hasData = data.some((metric) => metric.accuracyTotal > 0 || metric.bidCount > 0);
  const emptyMessage = loadError
    ? 'Historical data unavailable. Live games will populate round insights once complete.'
    : 'Complete a game to unlock round accuracy insights.';

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = React.useState<number>(0);

  React.useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    if (typeof ResizeObserver === 'undefined') {
      setContainerWidth(element.clientWidth);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const effectiveWidth =
    containerWidth > 0 ? containerWidth : Math.max(fallbackWidth, data.length * 34);
  const innerWidth = Math.max(0, effectiveWidth - margin.left - margin.right);

  const columnDomain = React.useMemo(
    () => (data.length > 0 ? data.map((_, index) => index) : [0]),
    [data],
  );

  const columnScale = React.useMemo(
    () =>
      scaleBand<number>({
        domain: columnDomain,
        range: [0, innerWidth],
        paddingInner: 0.18,
        paddingOuter: 0.08,
      }),
    [columnDomain, innerWidth],
  );

  const rowScale = React.useMemo(
    () =>
      scaleBand<number>({
        domain: [0],
        range: [0, chartHeight],
        paddingInner: 0.3,
        paddingOuter: 0.3,
      }),
    [],
  );

  const colorScale = React.useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, 100],
        range: ['#dbeafe', '#1d4ed8'],
        clamp: true,
      }),
    [],
  );

  const { showTooltip, hideTooltip, tooltipData, tooltipOpen, tooltipLeft, tooltipTop } =
    useTooltip<TooltipPayload>();

  const handleShowTooltip = React.useCallback(
    (metric: RoundMetric, cell: RectCell<HeatmapColumn, HeatmapBin>) => {
      const hasAttempts = metric.accuracyTotal > 0;
      const value = hasAttempts ? (metric.accuracyPercent ?? 0) : null;
      showTooltip({
        tooltipData: { metric, value },
        tooltipLeft: margin.left + cell.x + cell.width / 2,
        tooltipTop: margin.top + cell.y - 8,
      });
    },
    [showTooltip],
  );

  const handleHideTooltip = React.useCallback(() => {
    hideTooltip();
  }, [hideTooltip]);

  const summary = React.useMemo(() => {
    let matches = 0;
    let attempts = 0;
    let bids = 0;
    let highestBid: number | null = null;
    let lowestBid: number | null = null;
    for (const metric of data) {
      matches += metric.accuracyMatches;
      attempts += metric.accuracyTotal;
      bids += metric.bidCount;
      if (metric.highestBid != null) {
        highestBid =
          highestBid == null ? metric.highestBid : Math.max(highestBid, metric.highestBid);
      }
      if (metric.lowestBid != null) {
        lowestBid = lowestBid == null ? metric.lowestBid : Math.min(lowestBid, metric.lowestBid);
      }
    }
    const overallAccuracy = attempts === 0 ? null : Math.round((matches / attempts) * 1000) / 10;
    return { matches, attempts, bids, highestBid, lowestBid, overallAccuracy };
  }, [data]);

  const summaryItems = React.useMemo(
    () => [
      {
        label: 'Overall accuracy',
        value:
          summary.overallAccuracy == null
            ? '—'
            : `${percentFormatter.format(summary.overallAccuracy)}%`,
      },
      {
        label: 'Exact matches',
        value: integerFormatter.format(summary.matches),
        detail: `of ${integerFormatter.format(summary.attempts)} rounds`,
      },
      {
        label: 'Bids logged',
        value: integerFormatter.format(summary.bids),
      },
      {
        label: 'Top bid',
        value: summary.highestBid == null ? '—' : integerFormatter.format(summary.highestBid),
        detail:
          summary.lowestBid == null
            ? undefined
            : `Lowest ${integerFormatter.format(summary.lowestBid)}`,
      },
    ],
    [summary],
  );

  const heatmapData = data;

  return (
    <div className={styles.root}>
      <div ref={containerRef} className={styles.chartArea}>
        <svg
          className={styles.svg}
          width={effectiveWidth}
          height={chartHeight + margin.top + margin.bottom}
          role="img"
          aria-label="Round accuracy heatmap"
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            <HeatmapRect<HeatmapColumn, HeatmapBin>
              data={data}
              xScale={(index) => columnScale(index) ?? 0}
              yScale={() => rowScale(0) ?? 0}
              binWidth={columnScale.bandwidth()}
              binHeight={rowScale.bandwidth()}
              gap={4}
              bins={(metric) => [metric]}
              count={(metric) => (metric.accuracyTotal > 0 ? (metric.accuracyPercent ?? 0) : -1)}
            >
              {(cells: Array<Array<RectCell<HeatmapColumn, HeatmapBin>>>) =>
                cells.map((row) =>
                  row.map((cell) => {
                    const metric = cell.bin;
                    const hasAttempts = metric.accuracyTotal > 0;
                    const count =
                      hasAttempts && typeof metric.accuracyPercent === 'number'
                        ? metric.accuracyPercent
                        : null;
                    const fill = hasAttempts
                      ? (colorScale(count ?? 0) ?? 'var(--color-primary)')
                      : 'color-mix(in oklch, var(--color-border) 32%, transparent)';
                    const isActive = tooltipOpen && tooltipData?.metric.roundNo === metric.roundNo;
                    const ariaLabel = hasAttempts
                      ? `Round ${metric.roundNo} bid accuracy ${percentFormatter.format(
                          count ?? 0,
                        )} percent. ${integerFormatter.format(
                          metric.accuracyMatches,
                        )} exact of ${integerFormatter.format(metric.accuracyTotal)} rounds.`
                      : `Round ${metric.roundNo} has no recorded results yet.`;
                    const onFocus = () => handleShowTooltip(metric, cell);
                    const onBlur = () => handleHideTooltip();
                    const onEnter = () => handleShowTooltip(metric, cell);
                    const onLeave = () => handleHideTooltip();
                    return (
                      <g key={`round-${metric.roundNo}`} className={styles.cellGroup}>
                        <rect
                          tabIndex={0}
                          role="img"
                          aria-label={ariaLabel}
                          className={clsx(
                            styles.cellRect,
                            isActive && styles.cellRectActive,
                            !hasAttempts && styles.cellRectEmpty,
                          )}
                          x={cell.x}
                          y={cell.y}
                          width={cell.width}
                          height={cell.height}
                          rx={8}
                          ry={8}
                          fill={fill}
                          onFocus={onFocus}
                          onBlur={onBlur}
                          onMouseEnter={onEnter}
                          onMouseMove={onEnter}
                          onMouseLeave={onLeave}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleShowTooltip(metric, cell);
                            }
                          }}
                        />
                        {hasAttempts && count != null ? (
                          <text
                            className={styles.cellLabel}
                            x={cell.x + cell.width / 2}
                            y={cell.y + cell.height / 2}
                          >
                            {percentFormatter.format(count)}%
                          </text>
                        ) : null}
                      </g>
                    );
                  }),
                )
              }
            </HeatmapRect>

            {data.map((metric, index) => {
              const x = (columnScale(index) ?? 0) + columnScale.bandwidth() / 2;
              return (
                <text
                  key={`axis-${metric.roundNo}`}
                  className={styles.axisLabel}
                  x={x}
                  y={chartHeight + 20}
                  aria-hidden="true"
                >
                  {metric.roundNo}
                </text>
              );
            })}

            <text
              className={styles.axisTitle}
              x={innerWidth / 2}
              y={chartHeight + 32}
              aria-hidden="true"
            >
              Round number
            </text>
          </g>
        </svg>

        {!loading && !hasData ? (
          <div className={styles.emptyOverlay} role="status" aria-live="polite">
            {emptyMessage}
          </div>
        ) : null}

        {tooltipOpen && tooltipData ? (
          <TooltipWithBounds
            top={tooltipTop}
            left={tooltipLeft}
            className={styles.tooltip}
            aria-live="polite"
          >
            <div className={styles.tooltipTitle}>Round {tooltipData.metric.roundNo}</div>
            <div className={styles.tooltipValue}>
              {tooltipData.value == null
                ? 'No data yet'
                : `${percentFormatter.format(tooltipData.value)}%`}
            </div>
            <div className={styles.tooltipMeta}>
              {integerFormatter.format(tooltipData.metric.accuracyMatches)} exact ·{' '}
              {integerFormatter.format(tooltipData.metric.accuracyTotal)} rounds
            </div>
            <div className={styles.tooltipMeta}>
              {tooltipData.metric.highestBid == null
                ? 'No bids recorded'
                : `Bids ${tooltipData.metric.bids.join(', ') || tooltipData.metric.highestBid}`}
            </div>
          </TooltipWithBounds>
        ) : null}
      </div>

      <div className={styles.summary} role="list">
        {summaryItems.map((item) => (
          <div key={item.label} className={styles.summaryItem} role="listitem">
            <div className={styles.summaryLabel}>{item.label}</div>
            <div className={styles.summaryValue}>{item.value}</div>
            {item.detail ? <div className={styles.summaryDetail}>{item.detail}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
