'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Users } from 'lucide-react';
import clsx from 'clsx';

import { useAppState } from '@/components/state-provider';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';
import {
  events,
  selectAllRosters,
  selectPlayersOrdered,
  resolveScorecardRoute,
  SCORECARD_HUB_PATH,
  type AppState,
  type AppEvent,
} from '@/lib/state';
import { uuid } from '@/lib/utils';

import styles from './page.module.scss';

type RosterSummary = ReturnType<typeof selectAllRosters>[number];

function orderedRosterIds(roster: AppState['rosters'][string]) {
  const entries = Object.entries(roster.displayOrder ?? {}).sort((a, b) => a[1] - b[1]);
  const ids = entries.map(([id]) => id);
  for (const id of Object.keys(roster.playersById ?? {})) if (!ids.includes(id)) ids.push(id);
  return ids;
}

export default function ScorecardNewPageClient() {
  const router = useRouter();
  const { state, ready, appendMany } = useAppState();
  const [cleared, setCleared] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);
  const [clearError, setClearError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [pendingAction, setPendingAction] = React.useState<'roster' | 'create' | null>(null);

  const targetRoute = React.useMemo(() => resolveScorecardRoute(state), [state]);
  const players = React.useMemo(() => selectPlayersOrdered(state), [state]);
  const rosterSummaries = React.useMemo(
    () =>
      selectAllRosters(state)
        .filter((r) => !r.archived)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state],
  );
  const rosterMap = state.rosters;

  const [selectedRosterId, setSelectedRosterId] = React.useState<string | null>(null);
  const [playerCount, setPlayerCount] = React.useState(4);
  const playerCountOptions = React.useMemo(
    () => Array.from({ length: 9 }, (_, idx) => idx + 2),
    [],
  );

  // Ensure a roster is pre-selected when available
  React.useEffect(() => {
    if (selectedRosterId || rosterSummaries.length === 0) return;
    setSelectedRosterId(rosterSummaries[0]!.rosterId);
  }, [rosterSummaries, selectedRosterId]);

  // Redirect to hub when no scorecard session exists
  React.useEffect(() => {
    if (!ready) return;
    if (targetRoute === SCORECARD_HUB_PATH) {
      router.replace(SCORECARD_HUB_PATH);
    }
  }, [ready, router, targetRoute]);

  // Clear inherited players once hydration completes
  React.useEffect(() => {
    if (!ready) return;
    if (cleared || clearing) return;
    setClearError(null);
    if (players.length === 0) {
      setCleared(true);
      return;
    }
    setClearing(true);
    const removePlayers = async () => {
      try {
        const removalEvents = players.map((player) => events.playerRemoved({ id: player.id }));
        const reorder = events.playersReordered({ order: [] });
        await appendMany([...removalEvents, reorder]);
        setCleared(true);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `Unable to clear players: ${String(error)}`;
        setClearError(message);
      } finally {
        setClearing(false);
      }
    };
    void removePlayers();
  }, [appendMany, cleared, clearing, players, ready]);

  type RosterPlayerSummary = {
    id: string;
    name: string;
    type: 'human' | 'bot';
  };

  const rosterPlayers = React.useMemo<RosterPlayerSummary[]>(() => {
    if (!selectedRosterId) return [];
    const roster = rosterMap[selectedRosterId];
    if (!roster) return [];
    const order = orderedRosterIds(roster);
    return order.map((id) => ({
      id,
      name: roster.playersById?.[id] ?? id,
      type: (roster.playerTypesById?.[id] ?? 'human') as 'human' | 'bot',
    }));
  }, [rosterMap, selectedRosterId]);

  const actionPending = pendingAction !== null;
  const disabled = actionPending || clearing || !cleared || targetRoute === SCORECARD_HUB_PATH;

  const handleLoadRoster = React.useCallback(async () => {
    if (!selectedRosterId) {
      setSubmitError('Select a roster to continue.');
      return;
    }
    const roster = rosterMap[selectedRosterId];
    if (!roster) {
      setSubmitError('The selected roster is no longer available.');
      return;
    }
    const order = orderedRosterIds(roster);
    if (order.length < 2) {
      setSubmitError('Scorecard games require at least 2 players.');
      return;
    }
    if (order.length > 10) {
      setSubmitError('Scorecard games support up to 10 players.');
      return;
    }
    setPendingAction('roster');
    setSubmitError(null);
    try {
      const addEvents = order.map((id) =>
        events.playerAdded({
          id,
          name: roster.playersById?.[id] ?? id,
          type: roster.playerTypesById?.[id] ?? 'human',
        }),
      );
      const reorder = events.playersReordered({ order });
      await appendMany([...addEvents, reorder]);
      router.replace(targetRoute);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Unable to load roster: ${String(error)}`;
      setSubmitError(message);
      setPendingAction(null);
    }
  }, [appendMany, router, rosterMap, selectedRosterId, targetRoute]);

  const handleCreatePlayers = React.useCallback(async () => {
    if (!Number.isFinite(playerCount) || playerCount < 2 || playerCount > 10) {
      setSubmitError('Choose between 2 and 10 players.');
      return;
    }
    setPendingAction('create');
    setSubmitError(null);
    try {
      const addEvents: AppEvent[] = [];
      const order: string[] = [];
      for (let idx = 0; idx < playerCount; idx += 1) {
        const id = uuid();
        addEvents.push(
          events.playerAdded({
            id,
            name: `Player ${idx + 1}`,
            type: 'human',
          }),
        );
        order.push(id);
      }
      const reorder = events.playersReordered({ order });
      await appendMany([...addEvents, reorder]);
      router.replace(targetRoute);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Unable to create players: ${String(error)}`;
      setSubmitError(message);
      setPendingAction(null);
    }
  }, [appendMany, playerCount, router, targetRoute]);

  const showRosterList = rosterPlayers.length > 0;
  const countButtonsDisabled = clearing || actionPending || targetRoute === SCORECARD_HUB_PATH;

  return (
    <div className={styles.container}>
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent className={styles.dialog} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Set up your new scorecard</DialogTitle>
            <DialogDescription>
              Load players from an existing roster or start fresh with a new lineup.
            </DialogDescription>
          </DialogHeader>

          {clearError ? (
            <div role="alert" className={styles.error}>
              {clearError}
            </div>
          ) : null}

          <div className={styles.content}>
            <section className={styles.section}>
              <header className={styles.sectionHeader}>
                <h2>Load an existing roster</h2>
                <p>Select a saved roster to immediately populate this scorecard.</p>
              </header>
              {rosterSummaries.length === 0 ? (
                <p className={styles.empty}>No saved rosters yet.</p>
              ) : (
                <>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Roster</span>
                    <select
                      className={styles.select}
                      value={selectedRosterId ?? ''}
                      onChange={(event) => setSelectedRosterId(event.target.value || null)}
                      disabled={disabled}
                    >
                      {rosterSummaries.map((roster: RosterSummary) => (
                        <option key={roster.rosterId} value={roster.rosterId}>
                          {roster.name} ({roster.players} players)
                        </option>
                      ))}
                    </select>
                  </label>
                  {showRosterList ? (
                    <ul className={styles.rosterList} aria-live="polite">
                      {rosterPlayers.map((player) => (
                        <li key={player.id}>
                          <Users aria-hidden="true" className={styles.rosterIcon} />
                          <span>{player.name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <Button
                    className={styles.actionButton}
                    onClick={() => void handleLoadRoster()}
                    disabled={disabled || rosterSummaries.length === 0}
                  >
                    {pendingAction === 'roster' ? (
                      <>
                        <Loader2 className={styles.spinner} aria-hidden="true" />
                        Loading roster…
                      </>
                    ) : (
                      'Load roster'
                    )}
                  </Button>
                </>
              )}
            </section>

            <section className={styles.section}>
              <header className={styles.sectionHeader}>
                <h2>Create a new lineup</h2>
                <p>Generate placeholder players and update their names once the game begins.</p>
              </header>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Number of players</span>
                <div className={styles.countOptions} role="group" aria-label="Select player count">
                  {playerCountOptions.map((count) => {
                    const active = playerCount === count;
                    return (
                      <Button
                        key={count}
                        type="button"
                        size="sm"
                        variant={active ? 'default' : 'outline'}
                        aria-pressed={active}
                        className={clsx(styles.countButton, active && styles.countButtonActive)}
                        data-active={active ? 'true' : 'false'}
                        onClick={() => {
                          if (countButtonsDisabled) return;
                          setPlayerCount(count);
                        }}
                        disabled={countButtonsDisabled}
                      >
                        {count}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <Button
                className={styles.actionButton}
                variant="secondary"
                onClick={() => void handleCreatePlayers()}
                disabled={disabled}
              >
                {pendingAction === 'create' ? (
                  <>
                    <Loader2 className={styles.spinner} aria-hidden="true" />
                    Creating players…
                  </>
                ) : (
                  'Create lineup'
                )}
              </Button>
            </section>
          </div>

          {submitError ? (
            <div role="alert" className={styles.error}>
              {submitError}
            </div>
          ) : null}

          <DialogFooter>
            <div className={styles.footerStatus} role="status" aria-live="polite">
              {clearing ? (
                <>
                  <Loader2 className={styles.spinner} aria-hidden="true" />
                  Preparing your scorecard…
                </>
              ) : pendingAction === 'roster' ? (
                <>
                  <Loader2 className={styles.spinner} aria-hidden="true" />
                  Loading roster…
                </>
              ) : pendingAction === 'create' ? (
                <>
                  <Loader2 className={styles.spinner} aria-hidden="true" />
                  Creating players…
                </>
              ) : disabled && targetRoute === SCORECARD_HUB_PATH ? (
                'Waiting for scorecard session…'
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
