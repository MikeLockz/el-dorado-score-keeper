'use client';

import React, { Fragment } from 'react';
import { Button, Card } from '@/components/ui';
import { Edit, Trash, Plus } from 'lucide-react';
import { useAppState } from '@/components/state-provider';
import { events, selectPlayersOrdered, selectNextActionableRound } from '@/lib/state';

export default function PlayerList() {
  const { state, append, ready } = useAppState();
  const ordered = selectPlayersOrdered(state);
  const [localOrder, setLocalOrder] = React.useState(ordered);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!draggingId) setLocalOrder(ordered);
  }, [ordered, draggingId]);
  const players = localOrder;
  const minReached = players.length <= 2;

  const renamePlayer = async (playerId: string, currentName: string) => {
    const name = prompt('Rename player', currentName)?.trim();
    if (!name || name === currentName) return;
    await append(events.playerRenamed({ id: playerId, name }));
  };

  const removePlayer = async (playerId: string, currentName: string) => {
    // Soft-delete: drop from the next actionable round instead of hard removal
    if (players.length <= 2) {
      alert('At least 2 players are required.');
      return;
    }
    if (!confirm(`Remove player ${currentName}?`)) return;
    await append(events.playerDropped({ id: playerId, fromRound: nextRound }));
  };

  const nextRound = selectNextActionableRound(state) ?? 1;
  const dropPlayer = async (playerId: string) => {
    await append(events.playerDropped({ id: playerId, fromRound: nextRound }));
  };
  const resumePlayer = async (playerId: string) => {
    await append(events.playerResumed({ id: playerId, fromRound: nextRound }));
  };

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[1fr_auto] gap-x-2 text-sm">
        <div className="bg-slate-700 text-white p-2 font-bold">Player</div>
        <div className="bg-slate-700 text-white p-2 font-bold text-center">Actions</div>
        {ready && !minReached && players.length >= 3 && (
          <div className="col-span-2 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/40 border-b italic">
            Tip: drag names to reorder
          </div>
        )}
        {ready ? (
          <>
            {players.map((p, idx) => (
              <Fragment key={p.id}>
                <div
                  draggable={!minReached}
                  onDragStart={(e) => {
                    if (minReached) return;
                    setDraggingId(p.id);
                    try {
                      e.dataTransfer.setData('text/plain', p.id);
                    } catch {}
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    if (!draggingId) return;
                    e.preventDefault();
                    if (draggingId === p.id) return;
                    setLocalOrder((prev) => {
                      const from = prev.findIndex((x) => x.id === draggingId);
                      const to = prev.findIndex((x) => x.id === p.id);
                      if (from < 0 || to < 0 || from === to) return prev;
                      const next = prev.slice();
                      const [moved] = next.splice(from, 1);
                      next.splice(to, 0, moved);
                      return next;
                    });
                  }}
                  onDrop={(e) => {
                    if (!draggingId) return;
                    e.preventDefault();
                    const order = localOrder.map((x) => x.id);
                    void append(events.playersReordered({ order }));
                    setDraggingId(null);
                  }}
                  onDragEnd={() => {
                    if (!draggingId) return;
                    const order = localOrder.map((x) => x.id);
                    void append(events.playersReordered({ order }));
                    setDraggingId(null);
                  }}
                  aria-grabbed={draggingId === p.id || undefined}
                  aria-label={`Drag to reorder ${p.name}`}
                  className={`p-2 border-b truncate ${draggingId === p.id ? 'opacity-60' : ''} ${!minReached ? 'cursor-grab active:cursor-grabbing select-none' : ''}`}
                >
                  {p.name}
                </div>
                <div className="p-2 border-b text-center flex items-center justify-center gap-2">
                  {(() => {
                    const isDropped = state.rounds[nextRound]?.present?.[p.id] === false;
                    if (isDropped) {
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void resumePlayer(p.id)}
                          className="h-7 px-2"
                          title="Re-add from next round"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      );
                    }
                    // When not dropped, show trash which performs a soft drop
                    return (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void removePlayer(p.id, p.name)}
                        className="h-7 px-2"
                        disabled={minReached}
                        title="Remove (soft drop) from next round"
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    );
                  })()}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void renamePlayer(p.id, p.name)}
                    className="h-7 px-2"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </Fragment>
            ))}
            {players.length === 0 && (
              <div className="col-span-2 p-4 text-center text-slate-500">
                Add players to get started.
              </div>
            )}
          </>
        ) : (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <Fragment key={`placeholder-${i}`}>
                <div className="p-2 border-b truncate text-slate-400">-</div>
                <div className="p-2 border-b text-center flex items-center justify-center gap-2">
                  <Button size="sm" variant="outline" disabled className="h-7 px-2">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="destructive" disabled className="h-7 px-2">
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </Fragment>
            ))}
          </>
        )}
      </div>
    </Card>
  );
}
