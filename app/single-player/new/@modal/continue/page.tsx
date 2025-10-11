'use client';

import React from 'react';
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
import {
  getCurrentSinglePlayerGameId,
  resolveSinglePlayerRoute,
  singlePlayerPath,
} from '@/lib/state';
import { RoutedModalFocusManager } from '@/components/dialogs/RoutedModalFocusManager';

export default function ContinueSinglePlayerModal() {
  const router = useRouter();
  const { state } = useAppState();
  const currentGameId = React.useMemo(() => getCurrentSinglePlayerGameId(state), [state]);
  const dialogContentRef = React.useRef<HTMLDivElement>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);

  const handleClose = React.useCallback(() => {
    router.back();
  }, [router]);

  const handleContinue = React.useCallback(() => {
    if (currentGameId) {
      router.replace(singlePlayerPath(currentGameId));
    } else {
      router.replace(resolveSinglePlayerRoute(state, { fallback: 'entry' }));
    }
  }, [router, currentGameId, state]);

  return (
    <Dialog open onOpenChange={(open) => (!open ? handleClose() : undefined)}>
      <DialogContent ref={dialogContentRef}>
        <RoutedModalFocusManager
          contentRef={dialogContentRef}
          initialFocusRef={cancelButtonRef}
          announcement="Continue current single player game dialog opened"
        />
        <DialogHeader>
          <DialogTitle>Continue current game?</DialogTitle>
          <DialogDescription>
            Return to your in-progress single-player session without archiving. You can start a new
            game later from the header menu.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancelButtonRef} variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleContinue}>Resume game</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
