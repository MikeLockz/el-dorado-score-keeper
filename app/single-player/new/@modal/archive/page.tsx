'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
import { useNewGameRequest, hasSinglePlayerProgress } from '@/lib/game-flow';
import { getCurrentSinglePlayerGameId } from '@/lib/state';
import { RoutedModalFocusManager } from '@/components/dialogs/RoutedModalFocusManager';

export default function ArchiveSinglePlayerModal() {
  const router = useRouter();
  const { state, ready } = useAppState();
  const currentGameId = React.useMemo(() => getCurrentSinglePlayerGameId(state), [state]);
  const [error, setError] = React.useState<string | null>(null);
  const [trackingId, setTrackingId] = React.useState<string | null>(null);
  const hasProgress = React.useMemo(
    () => (ready ? hasSinglePlayerProgress(state) : false),
    [ready, state],
  );
  const dialogContentRef = React.useRef<HTMLDivElement>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);

  const { startNewGame, pending } = useNewGameRequest({
    requireIdle: true,
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
      setError(message);
    },
    analytics: { source: 'single-player.new.archive-modal' },
  });

  React.useEffect(() => {
    if (trackingId == null) return;
    const nextId = getCurrentSinglePlayerGameId(state);
    if (!nextId) return;
    if (trackingId !== '__none__' && nextId === trackingId) return;
    router.replace('/single-player/new');
  }, [trackingId, state, router]);

  const handleClose = React.useCallback(() => {
    router.back();
  }, [router]);

  const handleConfirm = React.useCallback(async () => {
    setError(null);
    setTrackingId(currentGameId ?? '__none__');
    const ok = await startNewGame({
      skipConfirm: true,
      analytics: { source: 'single-player.new.archive-modal.confirm' },
    });
    if (!ok) {
      setTrackingId(null);
      setError('Unable to archive the current game. Please try again.');
    }
  }, [currentGameId, startNewGame]);

  const archiveDisabled = pending || !ready;

  return (
    <Dialog open onOpenChange={(open) => (!open ? handleClose() : undefined)}>
      <DialogContent ref={dialogContentRef}>
        <RoutedModalFocusManager
          contentRef={dialogContentRef}
          initialFocusRef={cancelButtonRef}
          announcement="Archive current single player game dialog opened"
        />
        <DialogHeader>
          <DialogTitle>Archive current game?</DialogTitle>
          <DialogDescription>
            {hasProgress
              ? 'Archiving will capture your current single-player run and start a fresh session using a new game ID.'
              : 'Start a fresh single-player session. A new game will be created immediately.'}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" style={{ color: 'var(--color-destructive)' }}>
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button ref={cancelButtonRef} variant="outline" onClick={handleClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => handleConfirm()} disabled={archiveDisabled}>
            {pending ? (
              <>
                <Loader2 aria-hidden="true" />
                Archiving…
              </>
            ) : (
              'Archive & start new'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
