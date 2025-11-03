'use client';

import React from 'react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Archive, Trash2, Undo2, X, UserPlus } from 'lucide-react';

import { Button, InlineEdit, Card, EntityActionsCard } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import {
  assertEntityAvailable,
  selectRosterById,
  resolveRosterRoute,
  resolvePlayerRoute,
  events,
} from '@/lib/state';
import type { AppState } from '@/lib/state';
import { usePromptDialog } from '@/components/dialogs/PromptDialog';
import { useConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { useToast } from '@/components/ui/toast';
import { captureBrowserException } from '@/lib/observability/browser';
import { uuid } from '@/lib/utils';
import { trackRosterDetailView } from '@/lib/observability/events';

import RosterMissing from '../_components/RosterMissing';
import styles from './page.module.scss';

type RosterPlayer = {
  id: string;
  name: string;
  type: 'human' | 'bot';
};

export type RosterDetailPageClientProps = {
  rosterId: string;
};

function orderedRosterPlayers(roster: AppState['rosters'][string] | undefined): RosterPlayer[] {
  if (!roster) return [];
  const entries = Object.entries(roster.displayOrder ?? {}).sort((a, b) => a[1] - b[1]);
  const ids = entries.map(([id]) => id);
  for (const id of Object.keys(roster.playersById ?? {})) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.map((id) => ({
    id,
    name: roster.playersById[id] ?? id,
    type: roster.playerTypesById?.[id] ?? 'human',
  }));
}

function normalizeName(name: unknown): string {
  return typeof name === 'string' ? name.trim() : '';
}

function isPlayerNameTaken(state: AppState, candidate: string): boolean {
  const normalized = normalizeName(candidate).toLowerCase();
  if (!normalized) return false;
  for (const detail of Object.values(state.playerDetails ?? {})) {
    if (!detail) continue;
    if (normalizeName(detail.name).toLowerCase() === normalized) return true;
  }
  for (const value of Object.values(state.players ?? {})) {
    if (normalizeName(value).toLowerCase() === normalized) return true;
  }
  return false;
}

function nextPlayerLabel(state: AppState): string {
  const pattern = /^player\s+(\d+)$/i;
  let max = 0;
  const collections = [
    Object.values(state.playerDetails ?? {}).map((detail) => normalizeName(detail?.name)),
    Object.values(state.players ?? {}).map((value) => normalizeName(value)),
  ];
  for (const names of collections) {
    for (const name of names) {
      if (!name) continue;
      const match = pattern.exec(name);
      if (!match) continue;
      const num = Number(match[1]);
      if (Number.isFinite(num)) max = Math.max(max, num);
    }
  }
  return `Player ${max + 1}`;
}

const describeError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
};

const reportRosterError = (action: string, error: Error) => {
  captureBrowserException(error, {
    scope: 'roster-detail',
    action,
    reason: error.message || describeError(error),
  });
};

export function RosterDetailPageClient({ rosterId }: RosterDetailPageClientProps) {
  const router = useRouter();
  const { state, ready, append, appendMany } = useAppState();
  const promptDialog = usePromptDialog();
  const confirmDialog = useConfirmDialog();
  const { toast } = useToast();

  const rosterSlice = React.useMemo(() => selectRosterById(state, rosterId), [state, rosterId]);
  const availability = React.useMemo(
    () =>
      ready
        ? assertEntityAvailable(rosterSlice, 'roster', {
            id: rosterId,
            archived: rosterSlice?.archived ?? false,
          })
        : null,
    [ready, rosterSlice, rosterId],
  );

  const roster = availability?.entity?.roster;
  const archived = availability?.status === 'archived' || (availability?.entity?.archived ?? false);

  const rosterPlayers = React.useMemo(() => orderedRosterPlayers(roster), [roster]);
  const existingPlayerOptions = React.useMemo(() => {
    const taken = new Set(rosterPlayers.map((player) => player.id));
    const options: Array<{ id: string; name: string; type: 'human' | 'bot' }> = [];
    for (const [id, detail] of Object.entries(state.playerDetails ?? {})) {
      if (!detail || detail.archived || taken.has(id)) continue;
      options.push({ id, name: detail.name, type: detail.type });
    }
    for (const [id, value] of Object.entries(state.players ?? {})) {
      if (taken.has(id)) continue;
      if (options.some((opt) => opt.id === id)) continue;
      const detail = state.playerDetails?.[id];
      if (detail?.archived) continue;
      const normalized = normalizeName(value);
      if (!normalized) continue;
      options.push({ id, name: normalized, type: detail?.type ?? 'human' });
    }
    options.sort((a, b) => a.name.localeCompare(b.name));
    return options;
  }, [rosterPlayers, state.playerDetails, state.players]);

  const [selectedPlayerId, setSelectedPlayerId] = React.useState('');
  const [pending, setPending] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (
      selectedPlayerId &&
      !existingPlayerOptions.some((option) => option.id === selectedPlayerId)
    ) {
      setSelectedPlayerId('');
    }
  }, [existingPlayerOptions, selectedPlayerId]);

  React.useEffect(() => {
    if (!ready) return;
    if (!availability || availability.status === 'missing') return;
    trackRosterDetailView({
      rosterId,
      archived: availability.entity?.archived ?? false,
      source: 'rosters.detail.page',
    });
  }, [ready, availability, rosterId]);

  const runWithRosterAction = React.useCallback(
    async (action: string, op: () => Promise<void>) => {
      try {
        await op();
        return true;
      } catch (error: unknown) {
        const normalized = error instanceof Error ? error : new Error(describeError(error));
        reportRosterError(action, normalized);
        toast({
          title: 'Action failed',
          description: normalized.message || 'Please try again.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [toast],
  );

  // Roster name editing handler - creates new roster version to preserve history
  const handleSaveRosterName = React.useCallback(
    async (newName: string) => {
      if (newName.trim() === roster?.name) {
        // No change needed
        toast({
          title: 'No changes',
          description: 'Roster name is already set to this value.',
          variant: 'warning',
        });
        return;
      }

      try {
        await runWithRosterAction('rename-roster', async () => {
          // Create new roster version with same players but new ID
          const newRosterId = uuid();
          const currentPlayers = rosterPlayers.map((player) => ({
            id: player.id,
            name: player.name,
            type: player.type,
          }));

          // Create new roster with same players
          await append(
            events.rosterCreated({
              rosterId: newRosterId,
              name: newName,
              type: roster.type || 'scorecard', // Preserve original type
            }),
          );

          // Add all existing players to new roster
          for (const player of currentPlayers) {
            await append(
              events.rosterPlayerAdded({
                rosterId: newRosterId,
                id: player.id,
                name: player.name,
                type: player.type,
              }),
            );
          }

          // Update any games that referenced the old roster to use new roster ID
          // This would require a new event to update game roster references
          toast({
            title: 'Roster updated',
            description: `Created new roster version "${newName}"`,
            variant: 'success',
          });
        });
      } catch (error) {
        // Error is already handled by runWithRosterAction
        throw error;
      }
    },
    [runWithRosterAction, rosterId, append, toast],
  );

  const handleAddExistingPlayer = React.useCallback(async () => {
    if (!roster) return;
    if (!selectedPlayerId) {
      toast({
        title: 'Select a player',
        description: 'Choose an existing player to add to this roster.',
        variant: 'warning',
      });
      return;
    }
    const option = existingPlayerOptions.find((item) => item.id === selectedPlayerId);
    if (!option) {
      setSelectedPlayerId('');
      toast({
        title: 'Player unavailable',
        description: 'Choose another player to continue.',
        variant: 'warning',
      });
      return;
    }
    if (pending) return;
    setPending('add-existing');
    await runWithRosterAction('roster-add-player', async () => {
      await append(
        events.rosterPlayerAdded({
          rosterId,
          id: option.id,
          name: option.name,
          type: option.type,
        }),
      );
    });
    setPending(null);
    setSelectedPlayerId('');
  }, [
    append,
    existingPlayerOptions,
    pending,
    roster,
    rosterId,
    runWithRosterAction,
    selectedPlayerId,
    toast,
  ]);

  const handleCreateNewPlayer = React.useCallback(async () => {
    if (pending) return;
    const suggested = nextPlayerLabel(state);
    const name = await promptDialog({
      title: 'Create player',
      description: 'Name the player you want to add to this roster.',
      confirmLabel: 'Create player',
      cancelLabel: 'Cancel',
      defaultValue: suggested,
      placeholder: 'Player name',
      validate: (value) => {
        const trimmed = normalizeName(value);
        if (!trimmed) return 'Please enter a player name.';
        if (isPlayerNameTaken(state, trimmed)) return 'That name is already in use.';
        return null;
      },
    });
    if (!name) return;
    const trimmed = normalizeName(name);
    if (!trimmed) return;
    setPending('add-new');
    await runWithRosterAction('create-player-for-roster', async () => {
      // Create new roster version when adding player
      const newRosterId = uuid();
      const currentPlayers = rosterPlayers.map((player) => ({
        id: player.id,
        name: player.name,
        type: player.type,
      }));

      // Create new roster with current players + new player
      await append(
        events.rosterCreated({
          rosterId: newRosterId,
          name: roster.name, // Preserve original name
          type: roster.type || 'scorecard',
        }),
      );

      // Add all players (current + new) to new roster
      const allPlayers = [
        ...currentPlayers,
        {
          id: playerId,
          name: trimmed,
          type: 'human',
        },
      ];

      for (const player of allPlayers) {
        await append(
          events.rosterPlayerAdded({
            rosterId: newRosterId,
            id: player.id,
            name: player.name,
            type: player.type,
          }),
        );
      }

      toast({
        title: 'Roster updated',
        description: `Added ${trimmed} to roster (new version created)`,
        variant: 'success',
      });
    });
    setPending(null);
  }, [appendMany, pending, promptDialog, rosterId, runWithRosterAction, state]);

  const handleChangePlayerType = React.useCallback(
    async (player: RosterPlayer, newType: 'human' | 'bot') => {
      if (pending) return;
      setPending(`type:${player.id}`);
      await runWithRosterAction('change-roster-player-type', async () => {
        await append(events.rosterPlayerTypeSet({ rosterId, id: player.id, type: newType }));
      });
      setPending(null);
    },
    [append, pending, rosterId, runWithRosterAction],
  );

  const handleRemovePlayer = React.useCallback(
    async (player: RosterPlayer) => {
      if (pending) return;
      if (rosterPlayers.length <= 2) {
        toast({
          title: 'Add another player',
          description: 'Rosters require at least two players before removing one.',
          variant: 'warning',
        });
        return;
      }
      setPending(`remove:${player.id}`);
      await runWithRosterAction('remove-roster-player', async () => {
        // Create new roster version when removing player
        const newRosterId = uuid();
        const otherPlayers = rosterPlayers.filter((p) => p.id !== player.id);

        // Create new roster with remaining players
        await append(
          events.rosterCreated({
            rosterId: newRosterId,
            name: roster.name, // Preserve original name
            type: roster.type || 'scorecard',
          }),
        );

        // Add remaining players to new roster
        for (const otherPlayer of otherPlayers) {
          await append(
            events.rosterPlayerAdded({
              rosterId: newRosterId,
              id: otherPlayer.id,
              name: otherPlayer.name,
              type: otherPlayer.type,
            }),
          );
        }

        // Remove player from old roster
        await append(events.rosterPlayerRemoved({ rosterId, id: player.id }));
      });
      setPending(null);
    },
    [append, pending, rosterId, rosterPlayers, runWithRosterAction, toast],
  );

  const handleArchive = React.useCallback(async () => {
    if (pending || archived) return;
    const confirmed = await confirmDialog({
      title: 'Archive roster',
      description: 'Archive this roster? You can restore it later from the archived list.',
      confirmLabel: 'Archive roster',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setPending('archive');
    await runWithRosterAction('archive-roster', async () => {
      await append(events.rosterArchived({ rosterId }));
    });
    setPending(null);
  }, [append, archived, confirmDialog, pending, rosterId, runWithRosterAction]);

  const handleRestore = React.useCallback(async () => {
    if (pending || !archived) return;
    setPending('restore');
    await runWithRosterAction('restore-roster', async () => {
      await append(events.rosterRestored({ rosterId }));
    });
    setPending(null);
  }, [append, archived, pending, rosterId, runWithRosterAction]);

  const handleDelete = React.useCallback(async () => {
    if (pending) return;
    const confirmed = await confirmDialog({
      title: 'Delete roster',
      description: 'Delete this roster permanently? This cannot be undone.',
      confirmLabel: 'Delete roster',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setPending('delete');
    const ok = await runWithRosterAction('delete-roster', async () => {
      await append(events.rosterDeleted({ rosterId }));
    });
    setPending(null);
    if (ok) {
      router.push(resolveRosterRoute(null));
    }
  }, [append, confirmDialog, pending, rosterId, router, runWithRosterAction]);

  if (!ready) {
    return (
      <div className={styles.container}>
        <div className={styles.spinnerRow} role="status" aria-live="polite">
          <Loader2 className={styles.spinner} aria-hidden="true" />
          Loading roster…
        </div>
      </div>
    );
  }

  if (!availability || availability.status === 'missing' || !roster) {
    return <RosterMissing />;
  }

  const busy = pending !== null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.actions}>
          {archived ? (
            <Button
              variant="outline"
              onClick={() => void handleRestore()}
              disabled={!ready || !archived || pending !== null}
            >
              {pending === 'restore' ? (
                <Loader2 className={styles.spinner} aria-hidden="true" />
              ) : (
                <Undo2 aria-hidden="true" />
              )}{' '}
              Restore roster
            </Button>
          ) : null}
        </div>
      </header>

      <Card className={styles.playerDetailsSection}>
        <div className={styles.playerDetailsHeader}>
          <h2 className={styles.playerDetailsTitle}>Roster details</h2>
          <p className={styles.playerDetailsDescription}>
            Basic information and status for this roster.
          </p>
        </div>
        <dl className={styles.playerDetailsList}>
          <div className={styles.playerDetailsItem}>
            <dt className={styles.playerDetailsTerm}>Name</dt>
            <dd className={styles.playerDetailsDescription}>
              <InlineEdit
                value={roster?.name ?? ''}
                onSave={handleSaveRosterName}
                placeholder="Roster name"
                disabled={!ready || busy}
                fontWeight={700}
                validate={(value) => {
                  if (!value.trim()) return 'Roster name is required';
                  return null;
                }}
                saveLabel="Save"
                cancelLabel="Cancel"
                errorLabel="Failed to save roster name"
              />
            </dd>
          </div>
          <div className={styles.playerDetailsItem}>
            <dt className={styles.playerDetailsTerm}>Type</dt>
            <dd className={styles.playerDetailsDescription}>
              <span className={`${styles.playerBadge} ${styles.badge}`}>
                {roster.type === 'single' ? 'Single Player' : 'Scorecard'}
              </span>
            </dd>
          </div>
          <div className={styles.playerDetailsItem}>
            <dt className={styles.playerDetailsTerm}>Status</dt>
            <dd className={styles.playerDetailsDescription}>
              <span
                className={`${styles.playerBadge} ${archived ? styles.archivedBadge : styles.activeBadge}`}
              >
                {archived ? 'Archived' : 'Active'}
              </span>
            </dd>
          </div>
          <div className={styles.playerDetailsItem}>
            <dt className={styles.playerDetailsTerm}>Roster ID</dt>
            <dd className={styles.playerDetailsDescription}>
              <span className={styles.rosterId}>{availability.entity?.id}</span>
            </dd>
          </div>
        </dl>
      </Card>

      <EntityActionsCard
        title="Roster Actions"
        description="Manage this roster's status and availability."
        actions={
          archived
            ? [
                {
                  id: 'restore-roster',
                  label: 'Restore Roster',
                  variant: 'outline',
                  icon: <Undo2 aria-hidden="true" />,
                  onClick: () => void handleRestore(),
                  disabled: !ready || !archived || pending !== null,
                  pending: pending === 'restore',
                },
                {
                  id: 'delete-roster',
                  label: 'Delete Roster',
                  variant: 'destructive',
                  icon: <Trash2 aria-hidden="true" />,
                  onClick: () => void handleDelete(),
                  disabled: !ready || busy,
                  pending: pending === 'delete',
                },
              ]
            : [
                {
                  id: 'archive-roster',
                  label: 'Archive Roster',
                  variant: 'destructive',
                  icon: <Archive aria-hidden="true" />,
                  onClick: () => void handleArchive(),
                  disabled: !ready || busy || archived,
                  pending: pending === 'archive',
                },
              ]
        }
      />

      <section className={styles.section}>
        <div>
          <h2 className={styles.sectionTitle}>Players</h2>
          <p className={styles.sectionDescription}>
            Add players from your library or create new ones for this roster.
          </p>
        </div>
        <Card>
          {rosterPlayers.length === 0 ? (
            <div className={styles.emptyTableState}>No players assigned to this roster yet.</div>
          ) : (
            <table className={styles.playersTable}>
              <thead>
                <tr>
                  <th className={styles.tableHeader}>Player Name</th>
                  <th className={styles.tableHeader}>Type</th>
                  <th className={styles.tableHeader}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rosterPlayers.map((player) => (
                  <tr key={player.id} className={styles.tableRow}>
                    <td className={styles.tableCell}>
                      <span className={styles.playerName}>{player.name}</span>
                    </td>
                    <td className={styles.tableCell}>
                      <select
                        className={styles.typeSelect}
                        value={player.type}
                        onChange={(event) => {
                          const newType = event.target.value as 'human' | 'bot';
                          void handleChangePlayerType(player, newType);
                        }}
                        disabled={!ready || pending !== null}
                        aria-label={`Change ${player.name} type`}
                      >
                        <option value="human">Human</option>
                        <option value="bot">Bot</option>
                      </select>
                    </td>
                    <td className={styles.tableCell}>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void handleRemovePlayer(player)}
                        disabled={!ready || pending !== null}
                        aria-label={`Remove ${player.name}`}
                      >
                        {pending === `remove:${player.id}` ? (
                          <Loader2 className={styles.spinner} aria-hidden="true" />
                        ) : (
                          <X aria-hidden="true" />
                        )}
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <div className={styles.addRow}>
          <select
            className={styles.selectControl}
            value={selectedPlayerId}
            onChange={(event) => setSelectedPlayerId(event.target.value)}
            disabled={!ready || busy || existingPlayerOptions.length === 0}
            aria-label="Existing players"
          >
            <option value="">Select player…</option>
            {existingPlayerOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            onClick={() => void handleAddExistingPlayer()}
            disabled={!ready || busy || !selectedPlayerId || existingPlayerOptions.length === 0}
            className={styles.addButton}
          >
            <Plus aria-hidden="true" /> Add player
          </Button>
          <Button
            onClick={() => void handleCreateNewPlayer()}
            disabled={!ready || busy}
            className={styles.addButton}
          >
            <UserPlus aria-hidden="true" /> Create new player
          </Button>
        </div>
      </section>
    </div>
  );
}

export default RosterDetailPageClient;
