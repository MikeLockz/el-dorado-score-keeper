'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button, Card, Skeleton } from '@/components/ui';
import { Loader2, MoreHorizontal } from 'lucide-react';
import { type GameRecord, listGames, deleteGame, restoreGame } from '@/lib/state';
import { formatDateTime } from '@/lib/format';
import { useNewGameRequest } from '@/lib/game-flow';
import { cn } from '@/lib/utils';

type PendingAction = {
  type: 'restore' | 'delete';
  game: GameRecord;
};

const skeletonRows = Array.from({ length: 4 });

export default function GamesPage() {
  const [games, setGames] = React.useState<GameRecord[] | null>(null);
  const { startNewGame, pending: startPending } = useNewGameRequest();
  const router = useRouter();

  const load = React.useCallback(async () => {
    try {
      const list = await listGames();
      setGames(list);
    } catch (error) {
      console.warn('Failed to load games', error);
      setGames([]);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const [menuOpen, setMenuOpen] = React.useState<null | {
    id: string;
    x: number;
    y: number;
    openUp?: boolean;
  }>(null);
  const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null);
  const [optimisticState, setOptimisticState] = React.useState<
    Record<string, 'restoring' | 'deleting'>
  >({});
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 4500);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const onNewGame = async () => {
    const ok = await startNewGame();
    if (ok) {
      router.push('/');
    }
  };

  const requestAction = React.useCallback(
    (game: GameRecord, type: PendingAction['type']) => {
      if (optimisticState[game.id]) return;
      setMenuOpen(null);
      setPendingAction({ game, type });
    },
    [optimisticState],
  );

  const confirmAction = React.useCallback(async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    setOptimisticState((prev) => ({
      ...prev,
      [action.game.id]: action.type === 'restore' ? 'restoring' : 'deleting',
    }));
    const title = action.game.title || 'Untitled';
    setStatusMessage(`${action.type === 'restore' ? 'Restoring' : 'Deleting'} "${title}"…`);

    try {
      if (action.type === 'restore') {
        await restoreGame(undefined, action.game.id);
        setStatusMessage(`Restored "${title}". Redirecting to current game.`);
        router.push('/');
      } else {
        await deleteGame(undefined, action.game.id);
        setStatusMessage(`Deleted "${title}".`);
        await load();
      }
    } catch (error) {
      console.error(`Failed to ${action.type} game`, error);
      setStatusMessage(
        `Unable to ${action.type === 'restore' ? 'restore' : 'delete'} "${title}". Please try again.`,
      );
      await load();
    } finally {
      setOptimisticState((prev) => {
        const next = { ...prev };
        delete next[action.game.id];
        return next;
      });
    }
  }, [pendingAction, load, router]);

  return (
    <>
      <div className="p-3 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h1 className="text-lg font-bold text-foreground">Games</h1>
          <Button onClick={() => void onNewGame()} disabled={startPending}>
            {startPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Archiving…
              </>
            ) : (
              'New Game'
            )}
          </Button>
        </div>
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {statusMessage ?? ''}
        </div>
        {statusMessage ? (
          <div className="mb-3 rounded-md border border-status-bidding bg-status-bidding-surface px-3 py-2 text-sm text-status-bidding-foreground shadow-sm">
            {statusMessage}
          </div>
        ) : null}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle">
                <tr>
                  <th
                    scope="col"
                    className="sticky top-0 z-10 px-4 py-3 text-left font-semibold text-surface-subtle-foreground bg-surface-subtle"
                  >
                    Title
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 z-10 px-4 py-3 text-center font-semibold text-surface-subtle-foreground bg-surface-subtle"
                  >
                    Players
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 z-10 px-4 py-3 text-center font-semibold text-surface-subtle-foreground bg-surface-subtle"
                  >
                    Winner
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 z-10 px-4 py-3 text-center font-semibold text-surface-subtle-foreground bg-surface-subtle"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {games === null ? (
                  skeletonRows.map((_, idx) => (
                    <tr key={`skeleton-${idx}`} className="bg-background">
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <Skeleton className="mx-auto h-4 w-10" />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <Skeleton className="mx-auto h-4 w-20" />
                      </td>
                      <td className="px-4 py-4">
                        <Skeleton className="mx-auto h-8 w-28" />
                      </td>
                    </tr>
                  ))
                ) : games.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      No archived games yet.
                    </td>
                  </tr>
                ) : (
                  games.map((g) => {
                    const optimistic = optimisticState[g.id];
                    const disableActions = Boolean(optimistic);
                    return (
                      <tr
                        key={g.id}
                        className={cn(
                          'group transition-colors hover:bg-surface-accent focus-within:bg-surface-accent',
                          disableActions && 'opacity-60',
                        )}
                        onClick={() => {
                          if (disableActions) return;
                          router.push(`/games/view?id=${g.id}`);
                        }}
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium truncate text-foreground group-hover:text-foreground">
                            {g.title || 'Untitled'}
                          </div>
                          <div className="text-[0.72rem] text-muted-foreground group-hover:text-foreground/80 transition-colors">
                            {formatDateTime(g.finishedAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center align-top text-foreground">
                          {g.summary.players}
                        </td>
                        <td className="px-4 py-3 text-center align-top font-semibold text-foreground">
                          {g.summary.winnerName ?? '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div
                            className="flex items-center justify-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="hidden sm:flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => requestAction(g, 'restore')}
                                disabled={disableActions}
                              >
                                Restore
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => requestAction(g, 'delete')}
                                disabled={disableActions}
                              >
                                Delete
                              </Button>
                            </div>
                            <div className="sm:hidden">
                              <Button
                                size="icon"
                                variant="outline"
                                aria-label="Actions"
                                disabled={disableActions}
                                onClick={(event) => {
                                  if (disableActions) return;
                                  event.stopPropagation();
                                  const rect = (
                                    event.currentTarget as HTMLElement
                                  ).getBoundingClientRect();
                                  const spaceBelow = window.innerHeight - rect.bottom;
                                  const openUp = spaceBelow < 140;
                                  setMenuOpen((current) =>
                                    current && current.id === g.id
                                      ? null
                                      : {
                                          id: g.id,
                                          x: rect.right,
                                          y: openUp ? rect.top : rect.bottom,
                                          openUp,
                                        },
                                  );
                                }}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {optimistic ? (
                            <p
                              className={cn(
                                'mt-2 text-center text-xs font-medium',
                                optimistic === 'restoring'
                                  ? 'text-status-scored-foreground'
                                  : 'text-destructive',
                              )}
                            >
                              {optimistic === 'restoring' ? 'Restoring…' : 'Deleting…'}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {menuOpen ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
              <div
                className="fixed z-50 w-40 rounded-md border border-border bg-popover text-popover-foreground shadow-md py-1 text-sm"
                style={{
                  top: menuOpen.openUp ? menuOpen.y - 8 : menuOpen.y + 8,
                  left: menuOpen.x,
                  transform: menuOpen.openUp ? 'translate(-100%, -100%)' : 'translateX(-100%)',
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className="block w-full text-left px-3 py-2 hover:bg-surface-subtle"
                  onClick={() => {
                    const game = games?.find((item) => item.id === menuOpen.id);
                    if (game) {
                      requestAction(game, 'restore');
                    }
                  }}
                >
                  Restore
                </button>
                <button
                  className="block w-full text-left px-3 py-2 text-destructive hover:bg-surface-subtle"
                  onClick={() => {
                    const game = games?.find((item) => item.id === menuOpen.id);
                    if (game) {
                      requestAction(game, 'delete');
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </>
          ) : null}
        </Card>
      </div>
      <AlertDialog.Root
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null);
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg focus:outline-none">
            <AlertDialog.Title className="text-lg font-semibold text-foreground">
              {pendingAction?.type === 'restore' ? 'Restore this game?' : 'Delete this game?'}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
              {pendingAction?.type === 'restore'
                ? 'Restoring will replace your current progress with the archived session.'
                : 'Deleting removes the archived game permanently. This action cannot be undone.'}
            </AlertDialog.Description>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialog.Cancel asChild>
                <Button variant="outline">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant={pendingAction?.type === 'delete' ? 'destructive' : 'default'}
                  onClick={() => {
                    void confirmAction();
                  }}
                >
                  {pendingAction?.type === 'delete' ? 'Delete' : 'Restore'}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
