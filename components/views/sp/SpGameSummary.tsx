import React from 'react';
import clsx from 'clsx';

import ScorecardGrid, {
  type ScorecardPlayerColumn,
  type ScorecardRoundView,
} from '../scorecard/ScorecardGrid';
import type { ScoreCardRound } from './useSinglePlayerViewModel';

import styles from './sp-game-summary.module.scss';

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
    seed,
    onDetailsToggle,
    detailsActive,
    onClose,
    closeLabel,
    variant = 'full',
    scoreCardGrid,
  } = props;
  const isPanel = variant === 'panel';
  const showDetailsToggle = typeof onDetailsToggle === 'function';
  const rootClass = clsx(
    styles.root,
    isPanel ? styles.panelRoot : styles.fullRoot,
    !isPanel && showDetailsToggle && styles.fullWithDetailsNav,
  );
  const headerClass = clsx(styles.header, isPanel ? styles.panelHeader : styles.fullHeader);
  const mainClass = isPanel ? styles.panelMain : styles.fullMain;
  const titleClass = clsx(styles.title, isPanel && styles.panelTitle);
  const detailsButtonClass = clsx(
    styles.detailsButton,
    isPanel && styles.panelDetailsButton,
    detailsActive && styles.detailsButtonActive,
  );
  const activeScoreCardGrid =
    scoreCardGrid && scoreCardGrid.rounds.length > 0 ? scoreCardGrid : null;

  return (
    <div className={rootClass}>
      <header className={headerClass}>
        <div className={styles.headerInner}>
          <div className={styles.titleGroup}>
            <div className={titleClass}>{title}</div>
            {typeof seed === 'number' && Number.isFinite(seed) && (
              <div className={styles.seed}>Seed: {seed}</div>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label={closeLabel ?? 'Close summary'}
            >
              {closeLabel ?? 'Close'}
            </button>
          )}
        </div>
      </header>
      <main className={mainClass}>
        {activeScoreCardGrid ? (
          <ScorecardGrid
            columns={activeScoreCardGrid.columns}
            rounds={activeScoreCardGrid.rounds}
            disableInputs
            disableRoundStateCycling
          />
        ) : null}
      </main>
      {isPanel
        ? showDetailsToggle && (
            <footer className={styles.panelFooter}>
              <button
                type="button"
                className={detailsButtonClass}
                aria-label="Round details"
                aria-pressed={detailsActive ?? false}
                onClick={onDetailsToggle}
              >
                Back
              </button>
            </footer>
          )
        : showDetailsToggle && (
            <nav className={styles.fullDetailsNav}>
              <button
                type="button"
                className={detailsButtonClass}
                aria-label="Round details"
                aria-pressed={detailsActive ?? false}
                onClick={onDetailsToggle}
              >
                Back
              </button>
            </nav>
          )}
    </div>
  );
}
