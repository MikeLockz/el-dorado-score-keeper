'use client';

import React from 'react';
import { useRouter, useParams } from 'next/navigation';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { deleteGame, deriveGameMode, getGame, type GameRecord, resolveArchivedGameRoute } from '@/lib/state';
import { trackArchivedGameDeleted } from '@/lib/observability/events';
import { RoutedModalFocusManager } from '@/components/dialogs/RoutedModalFocusManager';

export default function DeleteGameModal() {
  const router = useRouter();
  const params = useParams();
  const raw = params?.gameId;
  const gameId = Array.isArray(raw) ? raw[0] ?? '' : typeof raw === 'string' ? raw : '';
  const [pending, setPending] = React.useState(false);
  const [game, setGame] = React.useState<GameRecord | null>(null);
  const dialogContentRef = React.useRef<HTMLDivElement>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);

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

  const handleDelete = React.useCallback(async () => {
    if (!gameId || pending) return;
    setPending(true);
    try {
      await deleteGame(undefined, gameId);
      const mode = game ? deriveGameMode(game) : undefined;
      trackArchivedGameDeleted({ gameId, mode, source: 'games.modal.delete' });
      router.replace(resolveArchivedGameRoute(null));
    } finally {
      setPending(false);
    }
  }, [pending, gameId, router, game]);

  const title = game?.title?.trim() || 'this game';

  return (
    <Dialog open onOpenChange={(open) => (!open ? close() : undefined)}>
      <DialogContent ref={dialogContentRef}>
        <RoutedModalFocusManager
          contentRef={dialogContentRef}
          initialFocusRef={cancelButtonRef}
          politeness="assertive"
          announcement={`Delete archived game dialog opened for ${title}`}
        />
        <DialogHeader>
          <DialogTitle>Delete archived game?</DialogTitle>
          <DialogDescription>
            Deleting {title} permanently removes the archived record. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancelButtonRef} variant="outline" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={pending || !gameId}>
            {pending ? 'Deleting…' : 'Delete game'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
