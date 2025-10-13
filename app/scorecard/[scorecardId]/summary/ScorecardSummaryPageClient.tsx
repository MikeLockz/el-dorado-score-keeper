'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
  scorecardId: string;
};

export function ScorecardSummaryPageClient({ scorecardId }: ScorecardSummaryPageClientProps) {
  const router = useRouter();
  const { state, ready } = useAppState();
  const { toast } = useToast();

  const session = React.useMemo(
    () => selectScorecardById(state, scorecardId),
    [state, scorecardId],
  );

  const players: ScorecardPlayer[] = React.useMemo(() => {
    if (!session?.roster) return [];
    const entries = Object.entries(session.roster.playersById ?? {});
    return entries.map(([id, name]) => ({ id, name, score: state.scores?.[id] ?? 0 }));
  }, [session, state.scores]);

  const maxScore = players.length > 0 ? Math.max(...players.map((p) => p.score)) : 0;

  const handlePrint = React.useCallback(() => {
    trackScorecardSummaryExport({
      scorecardId,
      format: 'print',
      source: 'scorecard.summary.page',
    });
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }, [scorecardId]);

  const handleCopyLink = React.useCallback(async () => {
    await shareLink({
      href: scorecardPath(scorecardId, 'summary'),
      toast,
      title: 'Scorecard summary',
      successMessage: 'Scorecard summary link copied',
    });
  }, [scorecardId, toast]);

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
      <CurrentGame disableInputs disableRoundStateCycling key={`${scorecardId}-summary`} />
    </div>
  );
}

export default ScorecardSummaryPageClient;
