import React from 'react';
import type { Suit } from '@/lib/single-player/types';

import ScorecardGrid, {
  type ScorecardPlayerColumn,
  type ScorecardRoundView,
} from '../scorecard/ScorecardGrid';
import type { ScoreCardRound } from './useSinglePlayerViewModel';

import styles from './sp-round-summary.module.scss';

export type PlayerSummary = Readonly<{
  id: string;
  name: string;
  bid: number | null;
  made: boolean | null;
  delta: number | null;
  total: number;
}>;

export default function SpRoundSummary(props: {
  roundNo: number;
  trump: Suit | null;
  dealerName: string | null;
  nextLeaderName: string | null;
  players: ReadonlyArray<PlayerSummary>;
  autoCanceled: boolean;
  remainingMs: number;
  onCancelAuto: () => void;
  onContinue: () => void;
  isLastRound: boolean;
  disabled?: boolean;
  scoreCardRounds: ReadonlyArray<ScoreCardRound>;
  scoreCardTotals: Record<string, number>;
  scoreCardGrid?: Readonly<{
    columns: ReadonlyArray<ScorecardPlayerColumn>;
    rounds: ReadonlyArray<ScorecardRoundView>;
  }>;
}) {
  const {
    roundNo,
    trump,
    dealerName,
    nextLeaderName,
    autoCanceled,
    remainingMs,
    onCancelAuto,
    onContinue,
    isLastRound,
    disabled,
    scoreCardGrid,
  } = props;
  const autoSecs = Math.ceil((remainingMs ?? 0) / 1000);
  if (!scoreCardGrid) {
    return null;
  }
  return (
    <div className={styles.root} onPointerDown={onCancelAuto}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>Round {roundNo} Summary</div>
        <div className={styles.headerMeta}>
          <div>
            Trump: <span className={styles.headerMetaStrong}>{trump ?? '—'}</span>
          </div>
          <div>
            Dealer: <span className={styles.headerMetaStrong}>{dealerName ?? '—'}</span>
          </div>
          <div>
            Next Leader: <span className={styles.headerMetaStrong}>{nextLeaderName ?? '—'}</span>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.autoMessage}>
          {autoCanceled ? 'Auto-advance canceled' : `Auto-advance in ${autoSecs}s… (tap to cancel)`}
        </div>

        <ScorecardGrid
          columns={scoreCardGrid.columns}
          rounds={scoreCardGrid.rounds}
          disableInputs
          disableRoundStateCycling
        />
      </main>
      <nav className={styles.actionsBar}>
        <button />
        <button className={styles.primaryButton} onClick={onContinue} disabled={!!disabled}>
          {isLastRound ? 'Finish Game' : 'Next Round'}
        </button>
      </nav>
    </div>
  );
}
