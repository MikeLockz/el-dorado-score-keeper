'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

import { useAppState } from '@/components/state-provider';
import { selectScorecardById, scorecardPath } from '@/lib/state';
import CurrentGame from '@/components/views/CurrentGame';
import { Button } from '@/components/ui/button';
import { trackScorecardSummaryExport } from '@/lib/observability/events';
import { shareLink } from '@/lib/ui/share';
import { useToast } from '@/components/ui/toast';

import ScorecardMissing from '../_components/ScorecardMissing';
import styles from './page.module.scss';

type ScorecardPlayer = {
  id: string;
  name: string;
  score: number;
};

export type ScorecardSummaryPageClientProps = {
  scorecardId?: string;
};

function useToastSafe() {
  try {
    return useToast();
  } catch {
    return { toast: () => undefined, dismiss: () => {} };
  }
}

export function ScorecardSummaryPageClient({ scorecardId }: ScorecardSummaryPageClientProps) {
  const { state, ready, context } = useAppState();
  const { toast } = useToastSafe();
  const hasResizeObserver =
    typeof window === 'undefined' || typeof window.ResizeObserver === 'function';

  const resolvedScorecardId = React.useMemo(() => {
    if (scorecardId && scorecardId !== 'scorecard-session') return scorecardId;
    if (context?.scorecardId) return context.scorecardId;
    if (state.activeScorecardRosterId) return state.activeScorecardRosterId;
    return scorecardId ?? null;
  }, [context?.scorecardId, scorecardId, state.activeScorecardRosterId]);

  const session = React.useMemo(
    () => selectScorecardById(state, resolvedScorecardId),
    [state, resolvedScorecardId],
  );

  const players: ScorecardPlayer[] = React.useMemo(() => {
    if (!session?.roster) return [];
    const entries = Object.entries(session.roster.playersById ?? {});
    return entries.map(([id, name]) => ({ id, name, score: state.scores?.[id] ?? 0 }));
  }, [session, state.scores]);

  const maxScore = players.length > 0 ? Math.max(...players.map((p) => p.score)) : 0;

  const handlePrint = React.useCallback(() => {
    const targetId = resolvedScorecardId ?? 'scorecard-session';
    trackScorecardSummaryExport({
      scorecardId: targetId,
      format: 'print',
      source: 'scorecard.summary.page',
    });
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }, [resolvedScorecardId]);

  const handleCopyLink = React.useCallback(async () => {
    const targetId = resolvedScorecardId ?? 'scorecard-session';
    await shareLink({
      href: scorecardPath(targetId, 'summary'),
      toast,
      title: 'Scorecard summary',
      successMessage: 'Scorecard summary link copied',
    });
  }, [resolvedScorecardId, toast]);

  if (!ready) {
    return (
      <div className={styles.container}>
        <div className={styles.spinnerRow} role="status" aria-live="polite">
          <Loader2 className={styles.spinner} aria-hidden="true" />
          Loading summary…
        </div>
      </div>
    );
  }

  if (!session) {
    return <ScorecardMissing />;
  }

  return (
    <div className={styles.container}>
      <section className={styles.summaryList} aria-label="Score totals">
        <h2 className={styles.summaryHeading}>Score totals</h2>
        {players.length === 0 ? (
          <div className={styles.summaryItem}>No players recorded for this scorecard.</div>
        ) : (
          players.map((player) => (
            <div key={player.id} className={styles.summaryItem}>
              <span className={player.score === maxScore ? styles.winner : undefined}>
                {player.name}
              </span>
              <span>{player.score}</span>
            </div>
          ))
        )}
      </section>
      <div className={styles.actions}>
        <Button variant="outline" onClick={handleCopyLink} type="button">
          Copy link
        </Button>
        <Button onClick={handlePrint} type="button">
          Print summary
        </Button>
      </div>
      {hasResizeObserver ? (
        <CurrentGame
          disableInputs
          disableRoundStateCycling
          key={`${resolvedScorecardId ?? 'scorecard'}-summary`}
        />
      ) : null}
    </div>
  );
}

export default ScorecardSummaryPageClient;
