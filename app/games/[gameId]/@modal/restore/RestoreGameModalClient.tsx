'use client';

import React from 'react';
import { useRouter, useParams } from 'next/navigation';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAppState } from '@/components/state-provider';
import { scrubDynamicParam } from '@/lib/static-export';
import {
  restoreGame,
  deriveGameMode,
  type GameRecord,
  getGame,
  isGameRecordCompleted,
} from '@/lib/state/io';
import { resolveSinglePlayerRoute, resolveScorecardRoute, SCORECARD_HUB_PATH } from '@/lib/state';
import { trackArchivedGameRestored } from '@/lib/observability/events';
import { RoutedModalFocusManager } from '@/components/dialogs/RoutedModalFocusManager';

export default function RestoreGameModalClient() {
  const router = useRouter();
  const params = useParams();
  const raw = params?.gameId;
  const gameId = scrubDynamicParam(raw);
  const [pending, setPending] = React.useState(false);
  const [game, setGame] = React.useState<GameRecord | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const appState = useAppState();
  const state = appState.state;
  const hydrationEpoch = appState.hydrationEpoch ?? 0;
  const stateRef = React.useRef(state);
  const dialogContentRef = React.useRef<HTMLDivElement>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);
  const isCompleted = React.useMemo(() => (game ? isGameRecordCompleted(game) : false), [game]);

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  React.useEffect(() => {
    setErrorMessage(null);
  }, [gameId, isCompleted]);

  React.useEffect(() => {
    let cancelled = false;
    if (!gameId) return;
    void (async () => {
      try {
        const record = await getGame(undefined, gameId);
        if (!cancelled) setGame(record);
      } catch {
        if (!cancelled) setGame(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const close = React.useCallback(() => {
    router.back();
  }, [router]);

  const waitForRestoredRoute = React.useCallback(
    async (mode: 'single-player' | 'scorecard', previousEpoch: number): Promise<string> => {
      const awaitHydration = appState.awaitHydration ?? (async () => {});
      await Promise.race([
        awaitHydration(previousEpoch),
        new Promise((resolve) => setTimeout(resolve, 750)),
      ]);
      const snapshot = stateRef.current;
      const candidate =
        mode === 'single-player'
          ? resolveSinglePlayerRoute(snapshot, { fallback: 'entry' })
          : resolveScorecardRoute(snapshot);
      if (mode === 'single-player') {
        return candidate.startsWith('/single-player/') && candidate.split('/').length >= 3
          ? candidate
          : resolveSinglePlayerRoute(snapshot, { fallback: 'entry' });
      }
      return candidate.startsWith('/scorecard/') ? candidate : SCORECARD_HUB_PATH;
    },
    [appState.awaitHydration],
  );

  const handleRestore = React.useCallback(async () => {
    if (!gameId || pending) return;
    if (isCompleted) {
      setErrorMessage('Completed games cannot be restored.');
      return;
    }
    setErrorMessage(null);
    setPending(true);
    try {
      const previousEpoch = hydrationEpoch;
      await restoreGame(undefined, gameId);
      const mode = game ? deriveGameMode(game) : undefined;
      const redirectPath =
        mode === 'single-player'
          ? await waitForRestoredRoute('single-player', previousEpoch)
          : mode === 'scorecard'
            ? await waitForRestoredRoute('scorecard', previousEpoch)
            : '/';
      trackArchivedGameRestored({ gameId, mode, source: 'games.modal.restore' });
      router.replace(redirectPath);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'Unable to restore game.';
      setErrorMessage(reason);
    } finally {
      setPending(false);
    }
  }, [pending, gameId, router, game, waitForRestoredRoute, isCompleted, hydrationEpoch]);

  const title = game?.title?.trim() || 'this game';
  const blockingMessage = isCompleted ? 'Completed games cannot be restored.' : null;
  const alertMessage = errorMessage ?? blockingMessage;

  return (
    <Dialog open onOpenChange={(open) => (!open ? close() : undefined)}>
      <DialogContent ref={dialogContentRef}>
        <RoutedModalFocusManager
          contentRef={dialogContentRef}
          initialFocusRef={cancelButtonRef}
          announcement={`Restore archived game dialog opened for ${title}`}
        />
        <DialogHeader>
          <DialogTitle>Restore archived game?</DialogTitle>
          <DialogDescription>
            {isCompleted
              ? `${title} has already been completed and cannot be restored.`
              : `Restoring ${title} will replace the current in-progress session. All unsaved progress will be archived automatically.`}
          </DialogDescription>
        </DialogHeader>
        {alertMessage ? (
          <p role="alert" style={{ color: 'var(--color-destructive)' }}>
            {alertMessage}
          </p>
        ) : null}
        <DialogFooter>
          <Button ref={cancelButtonRef} variant="outline" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void handleRestore()} disabled={pending || !gameId || isCompleted}>
            {pending ? 'Restoring…' : 'Restore game'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
