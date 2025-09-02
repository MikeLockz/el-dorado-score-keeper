'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MoreHorizontal } from 'lucide-react';
import type { GameRecord } from '@/lib/state/io';
import { listGames, archiveCurrentGameAndReset, deleteGame, restoreGame } from '@/lib/state/io';
import { formatDateTime } from '@/lib/format';

export default function GamesPage() {
  const [games, setGames] = React.useState<GameRecord[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  const load = React.useCallback(async () => {
    try {
      const list = await listGames();
      setGames(list);
    } catch (e) {
      console.warn('Failed to load games', e);
      setGames([]);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Manage mobile action menu visibility and anchor position
  const [menuOpen, setMenuOpen] = React.useState<null | {
    id: string;
    x: number;
    y: number;
    openUp?: boolean;
  }>(null);

  const onNewGame = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await archiveCurrentGameAndReset();
      // Navigate to default route; avoid immediate reload to not cancel navigation
      router.push('/');
    } finally {
      setLoading(false);
    }
  };

  const onRestore = async (id: string) => {
    if (!confirm('Restore this game as current? Current progress will be replaced.')) return;
    await restoreGame(undefined, id);
    router.push('/');
  };

  const onDelete = async (id: string) => {
    if (!confirm('Delete this archived game? This cannot be undone.')) return;
    await deleteGame(undefined, id);
    await load();
  };

  return (
    <div className="p-3 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold">Games</h1>
        <Button onClick={onNewGame} disabled={loading}>
          {loading ? 'Working…' : 'New Game'}
        </Button>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/80 backdrop-blur supports-[backdrop-filter]:bg-slate-50/60 dark:bg-slate-900/60 supports-[backdrop-filter]:dark:bg-slate-900/40">
              <tr>
                <th
                  scope="col"
                  className="sticky top-0 z-10 px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200 bg-inherit"
                >
                  Title
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-200 bg-inherit"
                >
                  Players
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-200 bg-inherit"
                >
                  Winner
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-200 bg-inherit"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {games === null ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : games.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    No archived games yet.
                  </td>
                </tr>
              ) : (
                games.map((g) => (
                  <tr
                    key={g.id}
                    className="group odd:bg-white even:bg-slate-50 hover:bg-slate-100 dark:odd:bg-slate-950 dark:even:bg-slate-900/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    onClick={() => router.push(`/games/view?id=${g.id}`)}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium truncate text-slate-900 dark:text-slate-100 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors">
                        {g.title || 'Untitled'}
                      </div>
                      <div className="text-[0.72rem] text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">
                        {formatDateTime(g.finishedAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center align-top text-slate-900 dark:text-slate-100">
                      {g.summary.players}
                    </td>
                    <td className="px-4 py-3 text-center align-top text-slate-900 dark:text-slate-100 font-semibold">
                      {g.summary.winnerName ?? '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="flex items-center justify-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="hidden sm:flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => onRestore(g.id)}>
                            Restore
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => onDelete(g.id)}>
                            Delete
                          </Button>
                        </div>
                        <div className="sm:hidden">
                          <Button
                            size="icon"
                            variant="outline"
                            aria-label="Actions"
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              const spaceBelow = window.innerHeight - rect.bottom;
                              const openUp = spaceBelow < 120;
                              setMenuOpen(
                                menuOpen && menuOpen.id === g.id
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
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
            <div
              className="fixed z-50 w-40 rounded-md border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-md py-1 text-sm"
              style={{
                top: menuOpen.openUp ? menuOpen.y - 8 : menuOpen.y + 8,
                left: menuOpen.x,
                transform: menuOpen.openUp ? 'translate(-100%, -100%)' : 'translateX(-100%)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="block w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                onClick={() => {
                  setMenuOpen(null);
                  onRestore(menuOpen.id);
                }}
              >
                Restore
              </button>
              <button
                className="block w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => {
                  setMenuOpen(null);
                  onDelete(menuOpen.id);
                }}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
