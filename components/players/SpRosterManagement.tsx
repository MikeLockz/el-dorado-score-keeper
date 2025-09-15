'use client';

import React, { Fragment } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { Edit, Trash, Plus, Copy } from 'lucide-react';
import { useAppState } from '@/components/state-provider';
import { events } from '@/lib/state';
import { selectActiveRoster, selectPlayersOrderedFor } from '@/lib/state/selectors';
import { uuid } from '@/lib/utils';

export default function SpRosterManagement() {
  const { state, append, appendMany, ready } = useAppState();
  const spRoster = selectActiveRoster(state, 'single');
  const scRoster = selectActiveRoster(state, 'scorecard');
  const players = selectPlayersOrderedFor(state, 'single');
  const [localOrder, setLocalOrder] = React.useState(players);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!draggingId) setLocalOrder(players);
  }, [players, draggingId]);

  const rosterId = spRoster?.rosterId ?? null;
  const hasPlayers = players.length > 0;
  const minReached = players.length <= 2;

  const createEmptyRoster = async () => {
    const rid = uuid();
    await appendMany([
      events.rosterCreated({ rosterId: rid, name: 'Single Player', type: 'single' }),
      events.rosterActivated({ rosterId: rid, mode: 'single' }),
    ]);
  };

  const cloneFromScorecard = async () => {
    if (!scRoster) return;
    const rid = uuid();
    const name = 'Single Player';
    const order = Object.entries(scRoster.displayOrder)
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id);
    await appendMany([
      events.rosterCreated({ rosterId: rid, name, type: 'single' }),
      ...order.map((id) =>
        events.rosterPlayerAdded({ rosterId: rid, id, name: scRoster.playersById[id] ?? id }),
      ),
      events.rosterPlayersReordered({ rosterId: rid, order }),
      events.rosterActivated({ rosterId: rid, mode: 'single' }),
    ]);
  };

  const addPlayer = async (name: string) => {
    if (!rosterId) return;
    const id = uuid();
    await append(events.rosterPlayerAdded({ rosterId, id, name }));
  };

  const renamePlayer = async (id: string, currentName: string) => {
    if (!rosterId) return;
    const name = prompt('Rename player', currentName)?.trim();
    if (!name || name === currentName) return;
    await append(events.rosterPlayerRenamed({ rosterId, id, name }));
  };

  const removePlayer = async (id: string, currentName: string) => {
    if (!rosterId) return;
    if (players.length <= 2) {
      alert('At least 2 players are required.');
      return;
    }
    if (!confirm(`Remove player ${currentName}?`)) return;
    await append(events.rosterPlayerRemoved({ rosterId, id }));
  };

  const resetRoster = async () => {
    if (!rosterId || !hasPlayers) return;
    if (!confirm('Remove all players from Single Player roster?')) return;
    await append(events.rosterReset({ rosterId }));
  };

  const [name, setName] = React.useState('');

  return (
    <Card className="overflow-hidden">
      <div className="p-3 border-b flex items-center justify-between">
        <div>
          <div className="font-semibold">Single Player Roster</div>
          <div className="text-xs text-muted-foreground">
            Manage players used by Single Player mode.
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void resetRoster()}
            disabled={!hasPlayers}
          >
            Reset
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void cloneFromScorecard()}
            disabled={!scRoster}
          >
            <Copy className="h-4 w-4 mr-1" /> Use Score Card
          </Button>
          <Button size="sm" onClick={() => void createEmptyRoster()} disabled={!!rosterId}>
            Create
          </Button>
        </div>
      </div>

      {!rosterId ? (
        <div className="p-3 text-sm text-muted-foreground">
          No Single Player roster yet. Create one or copy from Score Card.
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_auto] gap-x-2 text-sm">
          <div className="col-span-2 p-2">
            <div className="flex gap-2 items-center">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Add player name"
                className="h-9"
              />
              <Button
                onClick={() => {
                  const n = name.trim();
                  if (!n) return;
                  void addPlayer(n);
                  setName('');
                }}
                disabled={!name.trim()}
                className="h-9"
              >
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </div>
          <div className="bg-slate-700 text-white p-2 font-bold">Player</div>
          <div className="bg-slate-700 text-white p-2 font-bold text-center">Actions</div>
          {ready && !minReached && players.length >= 3 && (
            <div className="col-span-2 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/40 border-b italic">
              Tip: drag names to reorder
            </div>
          )}
          {ready ? (
            <>
              {localOrder.map((p) => (
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
                        if (!moved) return prev;
                        next.splice(to, 0, moved);
                        return next;
                      });
                    }}
                    onDrop={(e) => {
                      if (!draggingId) return;
                      e.preventDefault();
                      const order = localOrder.map((x) => x.id);
                      void append(events.rosterPlayersReordered({ rosterId, order }));
                      setDraggingId(null);
                    }}
                    onDragEnd={() => {
                      if (!draggingId) return;
                      const order = localOrder.map((x) => x.id);
                      void append(events.rosterPlayersReordered({ rosterId, order }));
                      setDraggingId(null);
                    }}
                    aria-grabbed={draggingId === p.id || undefined}
                    aria-label={`Drag to reorder ${p.name}`}
                    className={`p-2 border-b truncate ${
                      draggingId === p.id ? 'opacity-60' : ''
                    } ${!minReached ? 'cursor-grab active:cursor-grabbing select-none' : ''}`}
                  >
                    {p.name}
                  </div>
                  <div className="p-2 border-b text-center flex items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void removePlayer(p.id, p.name)}
                      className="h-7 px-2"
                      disabled={minReached}
                      title="Remove from SP roster"
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
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
      )}
    </Card>
  );
}
