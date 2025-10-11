'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useAppState } from '@/components/state-provider';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
} from '@/components/ui';
import { useNewGameRequest, hasSinglePlayerProgress } from '@/lib/game-flow';
import { getCurrentSinglePlayerGameId } from '@/lib/state';
import { trackSinglePlayerNewView } from '@/lib/observability/events';

import styles from './page.module.scss';

export default function SinglePlayerNewPageClient() {
  const router = useRouter();
  const { state, ready } = useAppState();
  const [autoCreating, setAutoCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const currentGameId = React.useMemo(() => getCurrentSinglePlayerGameId(state), [state]);
  const hasProgress = React.useMemo(
    () => (ready ? hasSinglePlayerProgress(state) : false),
    [ready, state],
  );

  const lastTrackedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!ready) return;
    const key = hasProgress ? 'progress' : 'empty';
    if (lastTrackedRef.current === key) return;
    lastTrackedRef.current = key;
    trackSinglePlayerNewView({ hasProgress, source: 'single-player.new.page' });
  }, [ready, hasProgress]);

  const { startNewGame, pending } = useNewGameRequest({
    requireIdle: true,
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
      setError(message);
    },
    analytics: { source: 'single-player.new' },
  });

  React.useEffect(() => {
    if (!ready) return;
    if (!autoCreating) return;
    if (!currentGameId) return;
    router.replace(`/single-player/${currentGameId}`);
  }, [ready, autoCreating, currentGameId, router]);

  React.useEffect(() => {
    if (!ready) return;
    if (hasProgress) return;
    if (autoCreating) return;
    setError(null);
    setAutoCreating(true);
    void startNewGame({ skipConfirm: true, analytics: { source: 'single-player.new.auto' } }).then(
      (ok) => {
        if (!ok) {
          setAutoCreating(false);
          setError('Unable to start a new game. Please try again.');
        }
      },
    );
  }, [ready, hasProgress, autoCreating, startNewGame]);

  const showAutoStatus = !hasProgress;
  const disabled = pending || autoCreating;

  return (
    <div className={styles.root}>
      <Card className={styles.card}>
        <CardHeader>
          <CardTitle>Start a new single-player game</CardTitle>
          <CardDescription>
            Archive your current progress or continue playing without changes. Deep links update
            automatically once a new game begins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showAutoStatus ? (
            <div className={styles.statusRow} role="status" aria-live="polite">
              <Loader2 className={styles.spinner} aria-hidden="true" />
              Creating a fresh single-player session…
            </div>
          ) : (
            <p className={styles.hint}>
              You have in-progress single-player activity. Choose an option below to archive and
              start over or resume your current run.
            </p>
          )}
          {error ? <p className={styles.error}>{error}</p> : null}
        </CardContent>
        {hasProgress ? (
          <CardFooter>
            <div className={styles.actions}>
              <Button
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  router.push('/single-player/new/archive');
                }}
              >
                Archive &amp; start new
              </Button>
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  router.push('/single-player/new/continue');
                }}
              >
                Continue current game
              </Button>
            </div>
          </CardFooter>
        ) : null}
      </Card>
    </div>
  );
}
