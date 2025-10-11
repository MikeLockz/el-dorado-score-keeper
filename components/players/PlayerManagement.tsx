'use client';

import React from 'react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';

import { useAppState } from '@/components/state-provider';
import { Button, Card } from '@/components/ui';
import {
  events,
  selectPlayersOrdered,
  selectArchivedPlayers,
  selectAllRosters,
  resolvePlayerRoute,
} from '@/lib/state';
import type { AppState, KnownAppEvent } from '@/lib/state';
import { useNewGameRequest } from '@/lib/game-flow';
import { uuid } from '@/lib/utils';
import {
  Loader2,
  Plus,
  Trash2,
  ArrowUpDown,
  UserPlus,
  RotateCcw,
  Archive,
  Undo2,
  Play,
  Users,
  Bot,
  BarChart3,
} from 'lucide-react';
import { usePromptDialog } from '@/components/dialogs/PromptDialog';
import { useConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { useToast } from '@/components/ui/toast';
import { captureBrowserException } from '@/lib/observability/browser';
import { trackPlayersAdded } from '@/lib/observability/events';

import styles from './player-management.module.scss';

function orderedRosterIds(roster: AppState['rosters'][string]) {
  const entries = Object.entries(roster.displayOrder ?? {}).sort((a, b) => a[1] - b[1]);
  const ids = entries.map(([id]) => id);
  for (const id of Object.keys(roster.playersById ?? {})) if (!ids.includes(id)) ids.push(id);
  return ids;
}

type PlayerRow = ReturnType<typeof selectPlayersOrdered>[number];
type RosterSummary = ReturnType<typeof selectAllRosters>[number];

type Pending = 'add' | 'rename' | 'remove' | 'type' | 'reset' | null;

type RosterPending =
  | 'create'
  | 'rename'
  | 'load-single'
  | 'load-score'
  | 'archive'
  | 'restore'
  | 'auto'
  | 'reset'
  | null;

function nextPlayerLabel(players: PlayerRow[], archived: ReturnType<typeof selectArchivedPlayers>) {
  const pattern = /^player\s+(\d+)$/i;
  let max = 0;
  for (const collection of [players, archived]) {
    for (const p of collection) {
      const match = pattern.exec(p.name.trim());
      if (match) {
        const num = Number(match[1]);
        if (Number.isFinite(num)) max = Math.max(max, num);
      }
    }
  }
  return `Player ${max + 1}`;
}

const describeError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
};

const reportPlayerError = (action: string, error: Error) => {
  const reason = error.message || describeError(error);
  captureBrowserException(error, {
    scope: 'player-management',
    action,
    reason,
  });
};

const runWithPlayerError = async (action: string, op: () => Promise<void>) => {
  try {
    await op();
    return true;
  } catch (error: unknown) {
    const normalized = error instanceof Error ? error : new Error(describeError(error));
    reportPlayerError(action, normalized);
    return false;
  }
};

function ensureUniqueName(
  name: string,
  players: PlayerRow[],
  archived: ReturnType<typeof selectArchivedPlayers>,
  excludeId?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const taken = [...players, ...archived].some(
    (p) => p.id !== excludeId && p.name.trim().toLowerCase() === lower,
  );
  return taken ? null : trimmed;
}

type PlayerManagementProps = {
  defaultPlayerView?: 'active' | 'archived';
  defaultShowArchivedRosters?: boolean;
};

export default function PlayerManagement({
  defaultPlayerView = 'active',
  defaultShowArchivedRosters = false,
}: PlayerManagementProps = {}) {
  const router = useRouter();
  const { state, append, appendMany, ready } = useAppState();
  const players = React.useMemo(() => selectPlayersOrdered(state), [state]);
  const archivedPlayers = React.useMemo(() => selectArchivedPlayers(state), [state]);
  const rosters = React.useMemo(() => selectAllRosters(state), [state]);
  const rosterMap = React.useMemo(() => state.rosters, [state.rosters]);
  const { startNewGame, pending: newGamePending } = useNewGameRequest({
    analytics: { source: 'players' },
  });
  const promptDialog = usePromptDialog();
  const confirmDialog = useConfirmDialog();
  const { toast } = useToast();

  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [localOrder, setLocalOrder] = React.useState(players);
  const [playerView, setPlayerView] = React.useState<'active' | 'archived'>(defaultPlayerView);
  const [showArchivedRosters, setShowArchivedRosters] = React.useState(defaultShowArchivedRosters);
  const [playerPending, setPlayerPending] = React.useState<Pending>(null);
  const [rosterPending, setRosterPending] = React.useState<RosterPending>(null);
  const [autoCreateCount, setAutoCreateCount] = React.useState(4);

  React.useEffect(() => {
    if (playerView === 'archived' && archivedPlayers.length === 0) {
      setPlayerView('active');
    }
  }, [playerView, archivedPlayers.length]);

  React.useEffect(() => {
    if (!draggingId) setLocalOrder(players);
  }, [players, draggingId]);

  const viewingArchivedPlayers = playerView === 'archived';

  const handleAddPlayer = React.useCallback(async () => {
    const suggested = nextPlayerLabel(players, archivedPlayers);
    const name = await promptDialog({
      title: 'Add player',
      description: 'Enter a name for the new player.',
      confirmLabel: 'Add player',
      cancelLabel: 'Cancel',
      defaultValue: suggested,
      placeholder: 'Player name',
      validate: (value) => {
        if (!value.trim()) return 'Please enter a player name.';
        return ensureUniqueName(value, players, archivedPlayers)
          ? null
          : 'That name is already in use.';
      },
    });
    if (!name) return;
    const unique = ensureUniqueName(name, players, archivedPlayers);
    if (!unique) return;
    const id = uuid();
    setPlayerPending('add');
    const ok = await runWithPlayerError('add-player', async () => {
      await append(events.playerAdded({ id, name: unique, type: 'human' }));
    });
    setPlayerPending(null);
    if (ok) {
      trackPlayersAdded({
        addedCount: 1,
        totalPlayers: Math.max(0, players.length + 1),
        inputMethod: 'manual',
        source: 'players.management.add',
        mode: 'scorecard',
      });
    }
  }, [append, players, archivedPlayers, promptDialog]);

  const handleRenamePlayer = React.useCallback(
    async (player: PlayerRow) => {
      const name = await promptDialog({
        title: 'Rename player',
        confirmLabel: 'Save name',
        cancelLabel: 'Cancel',
        defaultValue: player.name,
        placeholder: 'Player name',
        validate: (value) => {
          if (!value.trim()) return 'Please enter a player name.';
          return ensureUniqueName(value, players, archivedPlayers, player.id)
            ? null
            : 'That name is already in use.';
        },
      });
      if (!name || name.trim() === player.name.trim()) return;
      const unique = ensureUniqueName(name, players, archivedPlayers, player.id);
      if (!unique) return;
      setPlayerPending('rename');
      await runWithPlayerError('rename-player', async () => {
        await append(events.playerRenamed({ id: player.id, name: unique }));
      });
      setPlayerPending(null);
    },
    [append, players, archivedPlayers, promptDialog],
  );

  const handleTogglePlayerType = React.useCallback(
    async (player: PlayerRow) => {
      const next = player.type === 'human' ? 'bot' : 'human';
      setPlayerPending('type');
      await runWithPlayerError('toggle-player-type', async () => {
        await append(events.playerTypeSet({ id: player.id, type: next }));
      });
      setPlayerPending(null);
    },
    [append],
  );

  const handleRemovePlayer = React.useCallback(
    async (player: PlayerRow) => {
      if (players.length <= 2) {
        toast({
          title: 'Add another player',
          description: 'At least two players are required.',
          variant: 'warning',
        });
        return;
      }
      const confirmed = await confirmDialog({
        title: 'Remove player',
        description: `Remove ${player.name}? This cannot be undone.`,
        confirmLabel: 'Remove player',
        cancelLabel: 'Cancel',
        variant: 'destructive',
      });
      if (!confirmed) return;
      setPlayerPending('remove');
      await runWithPlayerError('remove-player', async () => {
        await append(events.playerRemoved({ id: player.id }));
      });
      setPlayerPending(null);
    },
    [append, players.length, confirmDialog, toast],
  );

  const handleRestorePlayer = React.useCallback(
    async (player: ReturnType<typeof selectArchivedPlayers>[number]) => {
      setPlayerPending('add');
      await runWithPlayerError('restore-player', async () => {
        await append(events.playerRestored({ id: player.id }));
      });
      setPlayerPending(null);
    },
    [append],
  );

  const handleResetPlayers = React.useCallback(async () => {
    if (players.length === 0) return;
    const confirmed = await confirmDialog({
      title: 'Reset players',
      description: 'Archive all players and clear the current list?',
      confirmLabel: 'Archive players',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setPlayerPending('reset');
    const removals = players.map((p, idx) =>
      events.playerRemoved({ id: p.id }, { ts: Date.now() + idx }),
    );
    await runWithPlayerError('reset-players', async () => {
      await appendMany(removals);
    });
    setPlayerPending(null);
  }, [appendMany, players, confirmDialog]);

  const handleAutoCreatePlayers = React.useCallback(async () => {
    const remaining = 10 - players.length;
    if (remaining <= 0) {
      toast({
        title: 'Player limit reached',
        description: 'You can manage up to 10 active players at a time.',
        variant: 'warning',
      });
      return;
    }
    const count = Math.min(autoCreateCount, remaining);
    if (count <= 0) return;
    const used = new Set<string>();
    for (const p of players) used.add(p.name.trim().toLowerCase());
    for (const p of archivedPlayers) used.add(p.name.trim().toLowerCase());
    const eventsToAppend: KnownAppEvent[] = [];
    let index = 0;
    while (eventsToAppend.length < count) {
      index += 1;
      const candidate = `Player ${index}`;
      const key = candidate.toLowerCase();
      if (used.has(key)) continue;
      used.add(key);
      eventsToAppend.push(events.playerAdded({ id: uuid(), name: candidate, type: 'human' }));
    }
    setPlayerPending('add');
    const ok = await runWithPlayerError('auto-create-players', async () => {
      await appendMany(eventsToAppend);
    });
    setPlayerPending(null);
    if (ok) {
      trackPlayersAdded({
        addedCount: eventsToAppend.length,
        totalPlayers: Math.max(0, players.length + eventsToAppend.length),
        inputMethod: 'auto-fill',
        source: 'players.management.auto-create',
        mode: 'scorecard',
      });
    }
  }, [appendMany, players, archivedPlayers, autoCreateCount, toast]);

  const onDragEnd = React.useCallback(
    (order: PlayerRow[]) => {
      setDraggingId(null);
      const ids = order.map((p) => p.id);
      void append(events.playersReordered({ order: ids }));
    },
    [append],
  );

  const handleRosterCreate = React.useCallback(async () => {
    const suggested = `Roster ${rosters.filter((r) => !r.archived).length + 1}`;
    const name = await promptDialog({
      title: 'Create roster',
      description: 'Choose a name for the new roster.',
      confirmLabel: 'Create roster',
      cancelLabel: 'Cancel',
      defaultValue: suggested,
      placeholder: 'Roster name',
      validate: (value) => (!value.trim() ? 'Please enter a roster name.' : null),
    });
    if (!name) return;
    const rid = uuid();
    setRosterPending('create');
    await runWithPlayerError('create-roster', async () => {
      await append(events.rosterCreated({ rosterId: rid, name: name.trim(), type: 'scorecard' }));
    });
    setRosterPending(null);
  }, [append, promptDialog, rosters]);

  const handleRosterRename = React.useCallback(
    async (roster: RosterSummary) => {
      const name = await promptDialog({
        title: 'Rename roster',
        confirmLabel: 'Save name',
        cancelLabel: 'Cancel',
        defaultValue: roster.name,
        placeholder: 'Roster name',
        validate: (value) => (!value.trim() ? 'Please enter a roster name.' : null),
      });
      if (!name || name.trim() === roster.name.trim()) return;
      setRosterPending('rename');
      await runWithPlayerError('rename-roster', async () => {
        await append(events.rosterRenamed({ rosterId: roster.rosterId, name: name.trim() }));
      });
      setRosterPending(null);
    },
    [append, promptDialog],
  );

  const handleRosterArchive = React.useCallback(
    async (roster: RosterSummary) => {
      const confirmed = await confirmDialog({
        title: 'Archive roster',
        description: `Archive "${roster.name}"? You can restore it later.`,
        confirmLabel: 'Archive roster',
        cancelLabel: 'Cancel',
        variant: 'destructive',
      });
      if (!confirmed) return;
      setRosterPending('archive');
      await runWithPlayerError('archive-roster', async () => {
        await append(events.rosterArchived({ rosterId: roster.rosterId }));
      });
      setRosterPending(null);
    },
    [append, confirmDialog],
  );

  const handleRosterRestore = React.useCallback(
    async (roster: RosterSummary) => {
      setRosterPending('restore');
      await runWithPlayerError('restore-roster', async () => {
        await append(events.rosterRestored({ rosterId: roster.rosterId }));
      });
      setRosterPending(null);
    },
    [append],
  );

  const applyRosterToScorecard = React.useCallback(
    async (rosterId: string) => {
      const roster = rosterMap[rosterId];
      if (!roster) return;
      const order = orderedRosterIds(roster);
      if (order.length < 2) {
        toast({
          title: 'Roster needs more players',
          description: 'Score card rosters require at least two players.',
          variant: 'warning',
        });
        return;
      }
      if (order.length > 10) {
        toast({
          title: 'Too many players for score card',
          description: 'Score card mode supports a maximum of 10 players.',
          variant: 'warning',
        });
        return;
      }
      const removeEvents = Object.keys(state.players ?? {}).map((id) =>
        events.playerRemoved({ id }),
      );
      const addEvents = order.map((id) =>
        events.playerAdded({
          id,
          name: roster.playersById[id] ?? id,
          type: roster.playerTypesById?.[id] ?? 'human',
        }),
      );
      const reorder = events.playersReordered({ order });
      await appendMany([...removeEvents, ...addEvents, reorder]);
      if (addEvents.length > 0) {
        trackPlayersAdded({
          addedCount: addEvents.length,
          totalPlayers: order.length,
          inputMethod: 'roster-load',
          source: 'players.apply-roster-scorecard',
          mode: 'scorecard',
        });
      }
    },
    [appendMany, rosterMap, state.players, toast],
  );

  const applyRosterToSingle = React.useCallback(
    async (rosterId: string) => {
      const roster = rosterMap[rosterId];
      if (!roster) return;
      const order = orderedRosterIds(roster);
      if (order.length < 2) {
        toast({
          title: 'Roster needs more players',
          description: 'Single player mode requires at least two players.',
          variant: 'warning',
        });
        return;
      }
      if (order.length > 6) {
        toast({
          title: 'Too many players for single player',
          description: 'Single player mode supports a maximum of 6 players.',
          variant: 'warning',
        });
        return;
      }
      const targetId = state.activeSingleRosterId ?? `sp-${rosterId}`;
      const batch: KnownAppEvent[] = [];
      if (!state.rosters[targetId] || state.rosters[targetId]?.type !== 'single') {
        batch.push(events.rosterCreated({ rosterId: targetId, name: roster.name, type: 'single' }));
      } else {
        batch.push(events.rosterReset({ rosterId: targetId }));
        if (state.rosters[targetId]?.name !== roster.name) {
          batch.push(events.rosterRenamed({ rosterId: targetId, name: roster.name }));
        }
      }
      for (const id of order) {
        batch.push(
          events.rosterPlayerAdded({
            rosterId: targetId,
            id,
            name: roster.playersById[id] ?? id,
            type: roster.playerTypesById?.[id] ?? 'human',
          }),
        );
      }
      batch.push(events.rosterPlayersReordered({ rosterId: targetId, order }));
      batch.push(events.rosterActivated({ rosterId: targetId, mode: 'single' }));
      await appendMany(batch);
    },
    [appendMany, rosterMap, state.activeSingleRosterId, state.rosters, toast],
  );

  const handleLoadRosterToScorecard = React.useCallback(
    async (roster: RosterSummary) => {
      setRosterPending('load-score');
      await runWithPlayerError('load-roster-scorecard', async () => {
        const ok = await startNewGame({
          analytics: { mode: 'scorecard', source: 'players.load-roster-scorecard' },
        });
        if (!ok) return;
        await applyRosterToScorecard(roster.rosterId);
      });
      setRosterPending(null);
    },
    [applyRosterToScorecard, startNewGame],
  );

  const handleLoadRosterToSingle = React.useCallback(
    async (roster: RosterSummary) => {
      setRosterPending('load-single');
      await runWithPlayerError('load-roster-single-player', async () => {
        await applyRosterToSingle(roster.rosterId);
      });
      setRosterPending(null);
    },
    [applyRosterToSingle],
  );

  const handleAutoCreateRoster = React.useCallback(async () => {
    const rid = uuid();
    const defaultPlayers = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
    setRosterPending('auto');
    await runWithPlayerError('create-default-roster', async () => {
      const eventsList: KnownAppEvent[] = [
        events.rosterCreated({ rosterId: rid, name: 'Default Roster', type: 'scorecard' }),
      ];
      const order: string[] = [];
      defaultPlayers.forEach((name) => {
        const id = uuid();
        eventsList.push(events.rosterPlayerAdded({ rosterId: rid, id, name, type: 'human' }));
        order.push(id);
      });
      eventsList.push(events.rosterPlayersReordered({ rosterId: rid, order }));
      await appendMany(eventsList);
    });
    setRosterPending(null);
  }, [appendMany]);

  const handleResetRosters = React.useCallback(async () => {
    const activeRosters = rosters.filter((r) => !r.archived);
    if (activeRosters.length === 0) return;
    const confirmed = await confirmDialog({
      title: 'Archive all rosters',
      description: 'Archive all active rosters?',
      confirmLabel: 'Archive all',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setRosterPending('reset');
    await runWithPlayerError('archive-all-rosters', async () => {
      await appendMany(activeRosters.map((r) => events.rosterArchived({ rosterId: r.rosterId })));
    });
    setRosterPending(null);
  }, [appendMany, rosters, confirmDialog]);

  const activeRosters = rosters.filter((r) => !r.archived);
  const archivedRosters = rosters.filter((r) => r.archived);

  return (
    <div className={styles.root}>
      <Card className={styles.sectionCard}>
        <header className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>
              <Users className={styles.headingIcon} aria-hidden="true" />{' '}
              {viewingArchivedPlayers ? 'Archived players' : 'Players'}
            </h2>
            <p className={styles.sectionDescription}>
              {viewingArchivedPlayers
                ? 'Restore archived players back to your active list.'
                : 'Manage active players, reorder seating, and maintain archived profiles.'}
            </p>
          </div>
          {!viewingArchivedPlayers ? (
            <div className={styles.sectionActions}>
              <Button
                onClick={() => void handleAddPlayer()}
                disabled={!ready || playerPending !== null}
              >
                {playerPending === 'add' ? (
                  <Loader2 className={styles.spinner} aria-hidden="true" />
                ) : (
                  <Plus aria-hidden="true" />
                )}
                Add Player
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleResetPlayers()}
                disabled={!ready || players.length === 0 || playerPending !== null}
              >
                <RotateCcw aria-hidden="true" /> Reset All
              </Button>
            </div>
          ) : null}
        </header>

        {viewingArchivedPlayers ? (
          <div className={styles.noticeStack}>
            <div className={styles.infoRow}>
              <button
                type="button"
                className={styles.sectionLink}
                onClick={() => setPlayerView('active')}
              >
                Back to players
              </button>
            </div>
            {archivedPlayers.length === 0 ? (
              <div className={styles.noticeCard}>No archived players yet.</div>
            ) : (
              <div className={styles.archivedList}>
                {archivedPlayers.map((player) => (
                  <div key={player.id} className={styles.archivedRow}>
                    <div className={styles.archivedInfo}>
                      <div className={styles.playerName}>{player.name}</div>
                      <div className={styles.archivedMeta}>
                        {player.type === 'bot' ? 'Bot' : 'Human'} • Archived{' '}
                        {new Date(player.archivedAt).toLocaleString()}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRestorePlayer(player)}
                      disabled={!ready || playerPending !== null}
                    >
                      <Undo2 aria-hidden="true" /> Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {players.length === 0 ? (
              <div className={styles.noticeCard}>
                <div className={styles.noticeStack}>
                  <p>No active players yet.</p>
                  <div className={styles.noticeActions}>
                    <label htmlFor="auto-count">Auto-create</label>
                    <select
                      id="auto-count"
                      className={styles.select}
                      value={autoCreateCount}
                      onChange={(event) => setAutoCreateCount(Number(event.target.value))}
                    >
                      {[2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      onClick={() => void handleAutoCreatePlayers()}
                      disabled={!ready || playerPending !== null}
                    >
                      <UserPlus aria-hidden="true" /> Generate
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.playerList} role="list">
                {localOrder.map((player) => (
                  <div
                    key={player.id}
                    role="listitem"
                    className={clsx(
                      styles.playerRow,
                      styles.playerRowDraggable,
                      draggingId === player.id && styles.playerRowDragging,
                    )}
                    draggable
                    aria-label={`Drag to reorder ${player.name}`}
                    aria-grabbed={draggingId === player.id || undefined}
                    onDragStart={(event) => {
                      setDraggingId(player.id);
                      event.dataTransfer.setData('text/plain', player.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (!draggingId || draggingId === player.id) return;
                      setLocalOrder((prev) => {
                        const from = prev.findIndex((item) => item.id === draggingId);
                        const to = prev.findIndex((item) => item.id === player.id);
                        if (from < 0 || to < 0 || from === to) return prev;
                        const next = prev.slice();
                        const [moved] = next.splice(from, 1);
                        if (!moved) return prev;
                        next.splice(to, 0, moved);
                        return next;
                      });
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!draggingId) return;
                      onDragEnd(localOrder);
                    }}
                    onDragEnd={() => {
                      if (!draggingId) return;
                      onDragEnd(localOrder);
                    }}
                  >
                    <div className={styles.playerHeader}>
                      <span className={styles.dragIcon}>
                        <ArrowUpDown aria-hidden="true" />
                      </span>
                      <div>
                        <div className={styles.playerName}>{player.name}</div>
                        <div className={styles.playerMeta}>
                          {player.type === 'bot' ? 'Bot' : 'Human'}
                        </div>
                      </div>
                    </div>
                    <div className={styles.playerActions}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleTogglePlayerType(player)}
                        disabled={!ready || playerPending !== null}
                      >
                        <Bot aria-hidden="true" />{' '}
                        {player.type === 'human' ? 'Mark Bot' : 'Mark Human'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(resolvePlayerRoute(player.id, { view: 'statistics' }))}
                        disabled={!ready}
                        data-testid={`view-stats-player-${player.id}`}
                      >
                        <BarChart3 aria-hidden="true" /> View stats
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRenamePlayer(player)}
                        disabled={!ready || playerPending !== null}
                        data-testid={`rename-player-${player.id}`}
                      >
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void handleRemovePlayer(player)}
                        disabled={!ready || playerPending !== null}
                      >
                        <Trash2 aria-hidden="true" /> Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {archivedPlayers.length > 0 ? (
              <div className={styles.playerFooter}>
                <button
                  type="button"
                  className={styles.infoText}
                  onClick={() => setPlayerView('archived')}
                >
                  See archived players
                </button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <Card className={styles.rosterCard}>
        <header className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>
              <Archive className={styles.headingIcon} aria-hidden="true" /> Rosters
            </h2>
            <p className={styles.sectionDescription}>
              Save player lineups and load them into score card or single player modes.
            </p>
          </div>
          <div className={styles.rosterActions}>
            <Button
              onClick={() => void handleRosterCreate()}
              disabled={!ready || rosterPending !== null}
            >
              {rosterPending === 'create' ? (
                <Loader2 className={styles.spinner} aria-hidden="true" />
              ) : (
                <Plus aria-hidden="true" />
              )}
              Create Roster
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleResetRosters()}
              disabled={!ready || rosterPending !== null || activeRosters.length === 0}
            >
              <RotateCcw aria-hidden="true" /> Archive All
            </Button>
          </div>
        </header>

        {activeRosters.length === 0 ? (
          <div className={styles.rosterEmpty}>
            <p>No active rosters yet.</p>
            <Button
              variant="outline"
              onClick={() => void handleAutoCreateRoster()}
              disabled={!ready || rosterPending !== null}
            >
              <UserPlus aria-hidden="true" /> Create default roster
            </Button>
          </div>
        ) : (
          <div className={styles.rosterGrid}>
            {activeRosters.map((roster) => {
              const detail = rosterMap[roster.rosterId];
              const playerCount = roster.players;
              return (
                <div key={roster.rosterId} className={styles.rosterItem}>
                  <div className={styles.rosterHeader}>
                    <div>
                      <div className={styles.rosterTitle}>{roster.name}</div>
                      <div className={styles.rosterMeta}>
                        {playerCount} {playerCount === 1 ? 'player' : 'players'} • Created{' '}
                        {new Date(roster.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className={styles.rosterActionsInline}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleLoadRosterToScorecard(roster)}
                        disabled={!ready || rosterPending !== null || newGamePending}
                      >
                        <Play aria-hidden="true" /> Load Score Card
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleLoadRosterToSingle(roster)}
                        disabled={!ready || rosterPending !== null}
                      >
                        <Users aria-hidden="true" /> Load Single Player
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRosterRename(roster)}
                        disabled={!ready || rosterPending !== null}
                        data-testid={`rename-roster-${roster.rosterId}`}
                      >
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void handleRosterArchive(roster)}
                        disabled={!ready || rosterPending !== null}
                      >
                        <Trash2 aria-hidden="true" /> Archive
                      </Button>
                    </div>
                  </div>
                  {detail ? (
                    <div className={clsx(styles.rosterPlayers, styles.mtSmall)}>
                      {orderedRosterIds(detail)
                        .map((id) => `${detail.playersById[id] ?? id}`)
                        .join(', ')}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {archivedRosters.length > 0 ? (
          <div className={styles.noticeStack}>
            <button
              type="button"
              className={styles.archivedToggle}
              onClick={() => setShowArchivedRosters((prev) => !prev)}
            >
              {showArchivedRosters ? 'Hide archived rosters' : 'Show archived rosters'}
            </button>
            {showArchivedRosters ? (
              <div className={styles.archivedRostersList}>
                {archivedRosters.map((roster) => (
                  <div key={roster.rosterId} className={styles.archivedRow}>
                    <div className={styles.archivedInfo}>
                      <div className={styles.playerName}>{roster.name}</div>
                      <div className={styles.archivedMeta}>
                        {roster.players} {roster.players === 1 ? 'player' : 'players'}
                      </div>
                    </div>
                    <div className={styles.rosterActionsInline}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRosterRestore(roster)}
                        disabled={!ready || rosterPending !== null}
                      >
                        <Undo2 aria-hidden="true" /> Restore
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
