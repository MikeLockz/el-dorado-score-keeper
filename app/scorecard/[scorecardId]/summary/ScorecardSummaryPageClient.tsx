'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';

import { useAppState } from '@/components/state-provider';
import { selectScorecardById, scorecardPath } from '@/lib/state';
import CurrentGame from '@/components/views/CurrentGame';
import { Button } from '@/components/ui/button';
import { trackScorecardSummaryExport } from '@/lib/observability/events';
import { shareLink } from '@/lib/ui/share';
import { useToast } from '@/components/ui/toast';
import { scrubDynamicParam } from '@/lib/static-export';

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

export function ScorecardSummaryPageClient({ scorecardId }: ScorecardSummaryPageClientProps) {
  const router = useRouter();
  const params = useParams();
  const { state, ready } = useAppState();
  let toastApi: ReturnType<typeof useToast> | null = null;
  try {
    toastApi = useToast();
  } catch {
    toastApi = null;
  }
  const toast = toastApi?.toast ?? (() => {});

  const resolvedScorecardId = React.useMemo(() => {
    if (scorecardId && scorecardId.trim()) return scorecardId.trim();
    const raw = params?.scorecardId as string | string[] | undefined;
    return scrubDynamicParam(raw);
  }, [params, scorecardId]);

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
    if (!resolvedScorecardId) return;
    trackScorecardSummaryExport({
      scorecardId: resolvedScorecardId,
      format: 'print',
      source: 'scorecard.summary.page',
    });
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }, [resolvedScorecardId]);

  const handleCopyLink = React.useCallback(async () => {
    if (!resolvedScorecardId) return;
    await shareLink({
      href: scorecardPath(resolvedScorecardId, 'summary'),
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

  const canRenderCurrentGame =
    typeof window !== 'undefined' && typeof (window as any).ResizeObserver === 'function';

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Score totals</h2>
          <p className={styles.description}>
            {players.length > 0
              ? 'Share or print the final scores for this session.'
              : 'Add players to this scorecard to view summary totals.'}
          </p>
        </div>
        <div className={styles.actions}>
          <Button
            variant="outline"
            onClick={() => void handleCopyLink()}
            aria-label="Copy summary link"
          >
            Copy summary link
          </Button>
          <Button onClick={() => void handlePrint()} aria-label="Print summary">
            Print summary
          </Button>
        </div>
      </header>
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
      {canRenderCurrentGame ? (
        <CurrentGame
          disableInputs
          disableRoundStateCycling
          key={`${resolvedScorecardId || 'summary'}-summary`}
        />
      ) : null}
    </div>
  );
}

export default ScorecardSummaryPageClient;
