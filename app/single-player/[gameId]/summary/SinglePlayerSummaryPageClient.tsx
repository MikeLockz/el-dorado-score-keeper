'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useAppState } from '@/components/state-provider';
import { selectSinglePlayerGame, selectHumanIdFor, singlePlayerPath } from '@/lib/state';
import {
  buildSinglePlayerDerivedState,
  type SinglePlayerDerivedState,
} from '@/components/views/sp/useSinglePlayerViewModel';
import SpGameSummary from '@/components/views/sp/SpGameSummary';
import { Button } from '@/components/ui/button';
import { shareLink } from '@/lib/ui/share';
import { useToast } from '@/components/ui/toast';

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

export type SinglePlayerSummaryPageClientProps = {
  gameId: string;
};

export function SinglePlayerSummaryPageClient({ gameId }: SinglePlayerSummaryPageClientProps) {
  const { state, ready } = useAppState();
  const router = useRouter();
  const explicitHumanId = React.useMemo(() => selectHumanIdFor(state, 'single'), [state]);
  const { toast } = useToast();

  const derived: SinglePlayerDerivedState | null = React.useMemo(() => {
    if (!ready) return null;
    if (!gameId) return null;
    const slice = selectSinglePlayerGame(state, gameId);
    if (!slice) return null;
    const order = Array.isArray(slice.sp?.order) ? (slice.sp!.order as string[]) : [];
    const humanId = pickHumanId(state, explicitHumanId, order);
    return buildSinglePlayerDerivedState(state, humanId);
  }, [ready, state, gameId, explicitHumanId]);

  const handleReturnToLive = React.useCallback(() => {
    router.push(singlePlayerPath(gameId));
  }, [router, gameId]);

  const handleCopyLink = React.useCallback(async () => {
    await shareLink({
      href: singlePlayerPath(gameId, 'summary'),
      toast,
      title: 'Single Player summary',
      successMessage: 'Single Player summary link copied',
    });
  }, [gameId, toast]);

  if (!ready) {
    return (
      <div className={styles.container}>
        <div className={styles.inner}>
          <div className={styles.spinnerRow} role="status" aria-live="polite">
            <Loader2 className={styles.spinner} aria-hidden="true" />
            Loading summary…
          </div>
        </div>
      </div>
    );
  }

  if (!derived || derived.players.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.inner}>
          <h2 className={styles.title}>Game summary</h2>
          <p className={styles.description}>Summary data is not available for this game yet.</p>
          <div className={styles.actions}>
            <Button variant="outline" onClick={handleReturnToLive}>
              Back to live play
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const totals = derived.players.map((player) => derived.scoreCardTotals[player.id] ?? 0);
  const maxScore = totals.length > 0 ? Math.max(...totals) : 0;
  const summaryPlayers = derived.players.map((player, idx) => ({
    id: player.id,
    name: player.name,
    total: totals[idx] ?? 0,
    isWinner: (totals[idx] ?? 0) === maxScore,
  }));

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <div className={styles.description}>
            View the final totals, round-by-round breakdown, and seed information for this
            single-player run.
          </div>
          <div className={styles.actions}>
            <Button variant="outline" onClick={() => void handleCopyLink()}>
              Copy link
            </Button>
            <Button variant="outline" asChild>
              <Link href={singlePlayerPath(gameId, 'scorecard')}>View scorecard</Link>
            </Button>
            <Button onClick={handleReturnToLive}>Back to live play</Button>
          </div>
        </header>
        <div className={styles.separator} aria-hidden="true" />
        <SpGameSummary
          title="Game summary"
          players={summaryPlayers}
          seed={derived.sessionSeed}
          onClose={handleReturnToLive}
          closeLabel="Back to live play"
          scoreCardRounds={derived.scoreCardRounds}
          scoreCardTotals={derived.scoreCardTotals}
          scoreCardGrid={derived.scoreCardGrid}
        />
      </div>
    </div>
  );
}

export default SinglePlayerSummaryPageClient;
