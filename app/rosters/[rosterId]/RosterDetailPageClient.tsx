'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Archive, Trash2, Undo2, X, UserPlus, Link2 } from 'lucide-react';

import { Button } from '@/components/ui';
import { Input } from '@/components/ui/input';
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
import { shareLink } from '@/lib/ui/share';
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

  const [nameValue, setNameValue] = React.useState(roster?.name ?? '');
  const [selectedPlayerId, setSelectedPlayerId] = React.useState('');
  const [pending, setPending] = React.useState<string | null>(null);

  React.useEffect(() => {
    setNameValue(roster?.name ?? '');
  }, [roster?.name]);

  React.useEffect(() => {
    if (
      selectedPlayerId &&
      !existingPlayerOptions.some((option) => option.id === selectedPlayerId)
    ) {
      setSelectedPlayerId('');
    }
  }, [existingPlayerOptions, selectedPlayerId]);

  const shareRosterName = roster?.name ?? rosterId;

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

  const handleCopyLink = React.useCallback(async () => {
    await shareLink({
      href: resolveRosterRoute(rosterId),
      toast,
      title: shareRosterName || 'Roster detail',
      successMessage: 'Roster link copied',
    });
  }, [rosterId, shareRosterName, toast]);

  const handleCommitName = React.useCallback(async () => {
    if (!roster) return;
    const currentName = roster.name ?? '';
    const trimmed = nameValue.trim();
    if (!trimmed) {
      toast({
        title: 'Roster name required',
        description: 'Enter a roster name before saving.',
        variant: 'warning',
      });
      setNameValue(currentName);
      return;
    }
    if (trimmed === currentName) return;
    if (pending) return;
    setPending('rename');
    const ok = await runWithRosterAction('rename-roster', async () => {
      await append(events.rosterRenamed({ rosterId, name: trimmed }));
    });
    setPending(null);
    if (!ok) {
      setNameValue(currentName);
    }
  }, [append, nameValue, pending, roster, rosterId, runWithRosterAction, toast]);

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
      const playerId = uuid();
      await appendMany([
        events.playerAdded({ id: playerId, name: trimmed, type: 'human' }),
        events.rosterPlayerAdded({ rosterId, id: playerId, name: trimmed, type: 'human' }),
      ]);
    });
    setPending(null);
  }, [appendMany, pending, promptDialog, rosterId, runWithRosterAction, state]);

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
        await append(events.rosterPlayerRemoved({ rosterId, id: player.id }));
      });
      setPending(null);
    },
    [append, pending, rosterId, rosterPlayers.length, runWithRosterAction, toast],
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
        <div className={styles.titleRow}>
          <Input
            value={nameValue}
            onChange={(event) => setNameValue(event.target.value)}
            onBlur={() => void handleCommitName()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleCommitName();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setNameValue(roster.name ?? '');
              }
            }}
            disabled={!ready || busy}
            className={styles.nameInput}
            aria-label="Roster name"
          />
          {archived ? (
            <span className={`${styles.badge} ${styles.archivedBadge}`}>Archived</span>
          ) : null}
        </div>
        <div className={styles.meta}>Roster ID: {availability.entity?.id}</div>
        <div className={styles.meta}>
          Mode:{' '}
          <span className={styles.badge}>
            {roster.type === 'single' ? 'Single Player' : 'Scorecard'}
          </span>
        </div>
        <div className={styles.actions}>
          <Button variant="outline" onClick={() => router.push(resolvePlayerRoute(null))}>
            Manage via Players hub
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push(resolveRosterRoute(null, { fallback: 'archived' }))}
          >
            Browse archived rosters
          </Button>
          <Button variant="outline" onClick={() => void handleCopyLink()}>
            <Link2 aria-hidden="true" /> Copy link
          </Button>
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

      <section className={styles.section}>
        <div>
          <h2 className={styles.sectionTitle}>Players</h2>
          <p className={styles.sectionDescription}>
            Add players from your library or create new ones for this roster.
          </p>
        </div>
        {rosterPlayers.length === 0 ? (
          <div className={styles.empty}>No players assigned to this roster yet.</div>
        ) : (
          <div className={styles.playerChips} role="list">
            {rosterPlayers.map((player) => (
              <div key={player.id} className={styles.playerChip} role="listitem">
                <div className={styles.playerChipInfo}>
                  <span className={styles.playerChipName}>{player.name}</span>
                  <span className={styles.playerChipMeta}>
                    {player.type === 'bot' ? 'Bot' : 'Human'}
                  </span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className={styles.playerChipRemove}
                  onClick={() => void handleRemovePlayer(player)}
                  disabled={!ready || pending !== null}
                  aria-label={`Remove ${player.name}`}
                >
                  {pending === `remove:${player.id}` ? (
                    <Loader2 className={styles.spinner} aria-hidden="true" />
                  ) : (
                    <X aria-hidden="true" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
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
          >
            <Plus aria-hidden="true" /> Add player
          </Button>
          <Button onClick={() => void handleCreateNewPlayer()} disabled={!ready || busy}>
            <UserPlus aria-hidden="true" /> Create new player
          </Button>
        </div>
      </section>

      <section className={styles.section}>
        <div>
          <h2 className={styles.sectionTitle}>Status</h2>
          <p className={styles.sectionDescription}>
            Archive to hide the roster from active lists or delete it permanently.
          </p>
        </div>
        <div className={styles.statusActions}>
          <Button
            variant="outline"
            onClick={() => void handleArchive()}
            disabled={!ready || busy || archived}
          >
            {pending === 'archive' ? (
              <Loader2 className={styles.spinner} aria-hidden="true" />
            ) : (
              <Archive aria-hidden="true" />
            )}{' '}
            Archive roster
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleDelete()}
            disabled={!ready || busy}
          >
            {pending === 'delete' ? (
              <Loader2 className={styles.spinner} aria-hidden="true" />
            ) : (
              <Trash2 aria-hidden="true" />
            )}{' '}
            Delete roster
          </Button>
        </div>
      </section>
    </div>
  );
}

export default RosterDetailPageClient;
