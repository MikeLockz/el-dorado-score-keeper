'use client';

import React, { Fragment } from 'react';
import clsx from 'clsx';

import { Button, Card } from '@/components/ui';
import { Edit, Trash, Plus } from 'lucide-react';
import { useAppState } from '@/components/state-provider';
import { events, selectPlayersOrdered, selectNextActionableRound } from '@/lib/state';

import styles from './player-list.module.scss';

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
  const resumePlayer = async (playerId: string) => {
    await append(events.playerResumed({ id: playerId, fromRound: nextRound }));
  };

  return (
    <Card className={styles.card}>
      <div className={styles.grid}>
        <div className={styles.headerCell}>Player</div>
        <div className={clsx(styles.headerCell, styles.headerCellActions)}>
          Actions
        </div>
        {ready && !minReached && players.length >= 3 && (
          <div className={styles.tipRow}>
            Tip: drag names to reorder
          </div>
        )}
        {ready ? (
          <>
            {players.map((p) => (
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
                  className={clsx(
                    styles.playerCell,
                    draggingId === p.id && styles.playerCellDragging,
                    !minReached && styles.playerCellDraggable,
                  )}
                >
                  {p.name}
                </div>
                <div className={styles.actionsCell}>
                  {(() => {
                    const isDropped = state.rounds[nextRound]?.present?.[p.id] === false;
                    if (isDropped) {
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void resumePlayer(p.id)}
                          className={styles.actionButton}
                          title="Re-add from next round"
                        >
                          <Plus aria-hidden="true" />
                        </Button>
                      );
                    }
                    // When not dropped, show trash which performs a soft drop
                    return (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void removePlayer(p.id, p.name)}
                        className={styles.actionButton}
                        disabled={minReached}
                        title="Remove (soft drop) from next round"
                      >
                        <Trash aria-hidden="true" />
                      </Button>
                    );
                  })()}
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
              <div className={clsx(styles.emptyRow, styles.placeholderCell)}>
                Add players to get started.
              </div>
            )}
          </>
        ) : (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <Fragment key={`placeholder-${i}`}>
                <div className={clsx(styles.playerCell, styles.placeholderCell)}>-</div>
                <div className={clsx(styles.actionsCell, styles.placeholderActions)}>
                  <Button size="sm" variant="outline" disabled className={styles.actionButton}>
                    <Edit aria-hidden="true" />
                  </Button>
                  <Button size="sm" variant="destructive" disabled className={styles.actionButton}>
                    <Trash aria-hidden="true" />
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
