import React from 'react';

import ScorecardGrid, {
  type ScorecardPlayerColumn,
  type ScorecardRoundView,
} from '../scorecard/ScorecardGrid';
import SpScoreCard from './SpScoreCard';
import type { ScoreCardRound } from './useSinglePlayerViewModel';

export type GameTotal = Readonly<{ id: string; name: string; total: number; isWinner: boolean }>;

export default function SpGameSummary(props: {
  title: string;
  players: ReadonlyArray<GameTotal>;
  seed?: number | null;
  onDetailsToggle?: () => void;
  detailsActive?: boolean;
  onClose?: () => void;
  closeLabel?: string;
  variant?: 'full' | 'panel';
  scoreCardRounds?: ReadonlyArray<ScoreCardRound>;
  scoreCardTotals?: Readonly<Record<string, number>>;
  scoreCardGrid?: Readonly<{
    columns: ReadonlyArray<ScorecardPlayerColumn>;
    rounds: ReadonlyArray<ScorecardRoundView>;
  }>;
}) {
  const {
    title,
    players,
    seed,
    onDetailsToggle,
    detailsActive,
    onClose,
    closeLabel,
    variant = 'full',
    scoreCardRounds,
    scoreCardTotals,
    scoreCardGrid,
  } = props;
  const isPanel = variant === 'panel';
  const showDetailsToggle = typeof onDetailsToggle === 'function';
  const containerClass = isPanel
    ? 'flex h-full flex-col'
    : `relative min-h-[100dvh]${showDetailsToggle ? ' pb-[calc(52px+env(safe-area-inset-bottom))]' : ''}`;
  const headerPadding = isPanel ? 'px-4 py-4' : 'p-3';
  const mainPadding = isPanel ? 'flex-1 overflow-auto px-4 py-4' : 'p-3';
  const titleClass = `${isPanel ? 'text-lg' : 'text-base'} font-semibold mt-1`;
  const detailsButtonBase = `${
    isPanel ? 'text-sm ' : ''
  }text-muted-foreground hover:text-foreground hover:underline ${detailsActive ? 'text-foreground underline' : ''}`;
  return (
    <div className={containerClass}>
      <header className={`border-b ${headerPadding}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={titleClass}>{title}</div>
            {typeof seed === 'number' && Number.isFinite(seed) && (
              <div className="mt-1 text-xs text-muted-foreground">Seed: {seed}</div>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
              onClick={onClose}
              aria-label={closeLabel ?? 'Close summary'}
            >
              {closeLabel ?? 'Close'}
            </button>
          )}
        </div>
      </header>
      <main className={mainPadding}>
        {scoreCardGrid && scoreCardGrid.rounds.length > 0 ? (
          <ScorecardGrid
            columns={scoreCardGrid.columns}
            rounds={scoreCardGrid.rounds}
            disableInputs
            disableRoundStateCycling
          />
        ) : !!scoreCardRounds?.length && scoreCardTotals ? (
          <SpScoreCard
            rounds={scoreCardRounds}
            totals={scoreCardTotals}
            players={players.map((p) => ({ id: p.id, name: p.name }))}
          />
        ) : null}
      </main>
      {isPanel
        ? showDetailsToggle && (
            <footer className="border-t px-4 py-3 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className={detailsButtonBase}
                aria-label="Round details"
                aria-pressed={detailsActive ?? false}
                onClick={onDetailsToggle}
              >
                Details
              </button>
            </footer>
          )
        : showDetailsToggle && (
            <nav
              className="fixed left-0 right-0 bottom-0 z-30 grid grid-cols-1 gap-2 px-2 py-2 border-t bg-background/85 backdrop-blur"
              style={{ minHeight: 52 }}
            >
              <button
                type="button"
                className={detailsButtonBase}
                aria-label="Round details"
                aria-pressed={detailsActive ?? false}
                onClick={onDetailsToggle}
              >
                Details
              </button>
            </nav>
          )}
    </div>
  );
}
