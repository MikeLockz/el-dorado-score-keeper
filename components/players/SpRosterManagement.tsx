'use client';

import React, { Fragment } from 'react';
import clsx from 'clsx';

import { Button, Card, Input } from '@/components/ui';
import { Edit, Trash, Plus, Copy } from 'lucide-react';
import { useAppState } from '@/components/state-provider';
import { events } from '@/lib/state';
import { selectActiveRoster, selectPlayersOrderedFor } from '@/lib/state/selectors';
import { uuid } from '@/lib/utils';

import styles from './sp-roster-management.module.scss';

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
    <Card className={styles.card}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <div className={styles.headerTitle}>Single Player Roster</div>
          <div className={styles.headerDescription}>Manage players used by Single Player mode.</div>
        </div>
        <div className={styles.headerActions}>
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
            <Copy aria-hidden="true" /> Use Score Card
          </Button>
          <Button size="sm" onClick={() => void createEmptyRoster()} disabled={!!rosterId}>
            Create
          </Button>
        </div>
      </div>

      {!rosterId ? (
        <div className={styles.emptyMessage}>
          No Single Player roster yet. Create one or copy from Score Card.
        </div>
      ) : (
        <div className={styles.body}>
          <div className={clsx(styles.formRow)}>
            <div className={styles.formControls}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Add player name"
                className={styles.formInput}
              />
              <Button
                onClick={() => {
                  const n = name.trim();
                  if (!n) return;
                  void addPlayer(n);
                  setName('');
                }}
                disabled={!name.trim()}
                className={styles.formButton}
              >
                <Plus aria-hidden="true" /> Add
              </Button>
            </div>
          </div>
          <div className={styles.headerCell}>Player</div>
          <div className={clsx(styles.headerCell, styles.headerCellActions)}>Actions</div>
          {ready && !minReached && players.length >= 3 && (
            <div className={styles.tipRow}>Tip: drag names to reorder</div>
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
                    className={clsx(
                      styles.playerCell,
                      draggingId === p.id && styles.playerCellDragging,
                      !minReached && styles.playerCellDraggable,
                    )}
                  >
                    {p.name}
                  </div>
                  <div className={styles.actionsCell}>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void removePlayer(p.id, p.name)}
                      className={styles.actionButton}
                      disabled={minReached}
                      title="Remove from SP roster"
                    >
                      <Trash aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void renamePlayer(p.id, p.name)}
                      className={styles.actionButton}
                    >
                      <Edit aria-hidden="true" />
                    </Button>
                  </div>
                </Fragment>
              ))}
              {players.length === 0 && (
                <div className={styles.emptyRow}>Add players to get started.</div>
              )}
            </>
          ) : (
            <>
              {Array.from({ length: 4 }).map((_, i) => (
                <Fragment key={`placeholder-${i}`}>
                  <div className={clsx(styles.playerCell, styles.placeholderCell)}>-</div>
                  <div className={styles.actionsCell}>
                    <Button size="sm" variant="outline" disabled className={styles.actionButton}>
                      <Edit aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled
                      className={styles.actionButton}
                    >
                      <Trash aria-hidden="true" />
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
