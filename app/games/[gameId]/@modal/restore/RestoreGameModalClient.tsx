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
import {
  resolveSinglePlayerRoute,
  resolveScorecardRoute,
  SCORECARD_HUB_PATH,
  singlePlayerPath,
  scorecardPath,
} from '@/lib/state';
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
    async (
      mode: 'single-player' | 'scorecard',
      previousEpoch: number,
      expectedArchiveId?: string,
    ): Promise<string> => {
      const awaitHydration = appState.awaitHydration ?? (async () => {});
      const maxWaitTime = 3000; // Increased timeout for archive restoration
      const checkInterval = 100; // Check state every 100ms

      // Wait for hydration with increased timeout for archive restoration
      await Promise.race([
        awaitHydration(previousEpoch),
        new Promise((resolve) => setTimeout(resolve, maxWaitTime)),
      ]);

      // For archive restoration, we need to poll the state multiple times
      // since restoration can take longer than the initial hydration
      const startTime = Date.now();
      let snapshot = stateRef.current;

      while (Date.now() - startTime < maxWaitTime) {
        snapshot = stateRef.current;

        if (mode === 'single-player') {
          const currentGameId = snapshot?.sp?.currentGameId;
          const gameId = snapshot?.sp?.gameId;

          // Check if restoration is complete by looking for the archive ID
          if (currentGameId === expectedArchiveId || gameId === expectedArchiveId) {
            console.log('✅ Archive restoration completed - found archive ID:', currentGameId);
            return `/single-player/${currentGameId}`;
          }

          // If we found a different UUID but it's a valid single-player game,
          // and the expected ID is an archive UUID, the restoration might still be in progress
          if (currentGameId && expectedArchiveId) {
            const expectedIsUuid =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                expectedArchiveId,
              );
            const currentIsUuid =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentGameId);

            if (expectedIsUuid && currentIsUuid && currentGameId !== expectedArchiveId) {
              console.log('⏳ Archive restoration in progress, waiting for archive ID update...');
              await new Promise((resolve) => setTimeout(resolve, checkInterval));
              continue;
            }
          }
        }

        // Wait a bit before next check
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }

      // Final check after timeout
      snapshot = stateRef.current;

      if (mode === 'single-player') {
        // For single-player games, explicitly use the archive UUID to ensure route consistency
        // This prevents the race condition where state hydration might not be complete
        const currentGameId = snapshot?.sp?.currentGameId;
        const gameId = snapshot?.sp?.gameId;

        console.log('🔍 waitForRestoredRoute final analysis:', {
          expectedArchiveId: expectedArchiveId ?? null,
          foundCurrentGameId: currentGameId,
          foundGameId: gameId,
          snapshotExists: !!snapshot,
          spExists: !!snapshot?.sp,
          sessionSeed: snapshot?.sp?.sessionSeed,
          uuidsMatch: expectedArchiveId ? currentGameId === expectedArchiveId : null,
          totalWaitTime: Date.now() - startTime,
        });

        const expectedIsUuid =
          typeof expectedArchiveId === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expectedArchiveId);

        // During archive restoration, prioritize the expected archive ID to avoid race conditions
        if (expectedIsUuid) {
          console.log('✅ Using archive UUID (priority during restoration):', expectedArchiveId);
          return `/single-player/${expectedArchiveId}`;
        }

        // Fallback to current game ID if no archive ID is available
        if (
          currentGameId &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentGameId)
        ) {
          console.log('✅ Using found game ID (no archive UUID):', currentGameId);
          return `/single-player/${currentGameId}`;
        }

        console.log('❌ No valid game ID found, using fallback');
        // Fallback to normal route resolution if for some reason the gameId isn't available
        const candidate = resolveSinglePlayerRoute(snapshot, { fallback: 'entry' });
        console.log('🔄 Fallback route resolved to:', candidate);
        return candidate.startsWith('/single-player/') && candidate.split('/').length >= 3
          ? candidate
          : resolveSinglePlayerRoute(snapshot, { fallback: 'entry' });
      }

      // For scorecard games, use the existing logic
      const candidate = resolveScorecardRoute(snapshot);
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

    console.log('🎮 Starting game restoration:', {
      archiveGameId: gameId,
      gameTitle: game?.title,
      gameMode: game ? deriveGameMode(game) : 'unknown',
    });

    try {
      const previousEpoch = hydrationEpoch;
      await restoreGame(undefined, gameId);

      console.log('🔄 Restoration completed, checking state...');

      const mode = game ? deriveGameMode(game) : undefined;
      const initialPath =
        mode === 'single-player'
          ? singlePlayerPath(gameId)
          : mode === 'scorecard'
            ? scorecardPath(gameId, 'live')
            : '/';

      console.log('🚀 Navigating to restored game (initial):', {
        archiveId: gameId,
        initialPath,
        mode,
      });

      router.replace(initialPath);

      let finalPath = initialPath;
      const resolvedPath =
        mode === 'single-player'
          ? await waitForRestoredRoute('single-player', previousEpoch, gameId)
          : mode === 'scorecard'
            ? await waitForRestoredRoute('scorecard', previousEpoch, gameId)
            : '/';

      if (resolvedPath && resolvedPath !== initialPath) {
        console.log('⏱️ Hydration resolved route update:', {
          archiveId: gameId,
          resolvedPath,
          previous: initialPath,
        });
        router.replace(resolvedPath);
        finalPath = resolvedPath;
      }

      console.log('✅ Restore redirect finalized:', {
        archiveId: gameId,
        finalPath,
        mode,
      });

      trackArchivedGameRestored({ gameId, mode, source: 'games.modal.restore' });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'Unable to restore game.';
      console.error('❌ Restoration failed:', { gameId, error: reason });
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
