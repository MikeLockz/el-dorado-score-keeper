'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

import { useAppState } from '@/components/state-provider';
import { selectSinglePlayerGame, selectHumanIdFor } from '@/lib/state';
import {
  buildSinglePlayerDerivedState,
  type SinglePlayerDerivedState,
} from '@/components/views/sp/useSinglePlayerViewModel';
import ScorecardGrid from '@/components/views/scorecard/ScorecardGrid';

import styles from './page.module.scss';

function pickHumanId(
  state: ReturnType<typeof useAppState>['state'],
  explicit: string | null,
  order: ReadonlyArray<string>,
): string {
  if (explicit) return explicit;
  for (const candidate of order) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  const firstPlayer = Object.keys(state.players ?? {}).find((id) => id.trim().length > 0);
  if (firstPlayer) return firstPlayer;
  return 'human-player';
}

export type SinglePlayerScorecardPageClientProps = {
  gameId: string;
};

export default function SinglePlayerScorecardPageClient({
  gameId,
}: SinglePlayerScorecardPageClientProps) {
  const { state, ready } = useAppState();
  const explicitHumanId = React.useMemo(() => selectHumanIdFor(state, 'single'), [state]);

  const derived: SinglePlayerDerivedState | null = React.useMemo(() => {
    if (!ready) return null;
    if (!gameId) return null;
    const slice = selectSinglePlayerGame(state, gameId);
    if (!slice) return null;
    const order = Array.isArray(slice.sp?.order) ? (slice.sp!.order as string[]) : [];
    const humanId = pickHumanId(state, explicitHumanId, order);
    return buildSinglePlayerDerivedState(state, humanId);
  }, [ready, state, gameId, explicitHumanId]);

  if (!ready) {
    return (
      <div className={styles.container}>
        <div className={styles.inner}>
          <div className={styles.loadingRow} role="status" aria-live="polite">
            <Loader2 className={styles.spinner} aria-hidden="true" />
            Loading scorecard…
          </div>
        </div>
      </div>
    );
  }

  if (!derived || derived.players.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.inner}>
          <h2 className={styles.heading}>Scorecard</h2>
          <p className={styles.description}>No scorecard data is available for this game yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <header>
          <h2 className={styles.heading}>Scorecard</h2>
          <p className={styles.description}>
            Review bids and round outcomes for this single-player session. The table updates as rounds
            complete.
          </p>
        </header>
        <div className={styles.separator} aria-hidden="true" />
        <ScorecardGrid
          columns={derived.scoreCardGrid.columns}
          rounds={derived.scoreCardGrid.rounds}
          disableInputs
          disableRoundStateCycling
        />
      </div>
    </div>
  );
}
