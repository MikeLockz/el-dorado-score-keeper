'use client';

import React from 'react';
import clsx from 'clsx';
import { Loader2, Users } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

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
  resolveSinglePlayerRoute,
  type AppState,
  type KnownAppEvent,
} from '@/lib/state';
import { uuid } from '@/lib/utils';

import styles from './page.module.scss';

type RosterSummary = ReturnType<typeof selectAllRosters>[number];

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

type PlayerSpec = Readonly<{
  id: string;
  name: string;
  type: 'human' | 'bot';
}>;

function orderedRosterIds(roster: AppState['rosters'][string]) {
  const entries = Object.entries(roster.displayOrder ?? {}).sort((a, b) => a[1] - b[1]);
  const ids = entries.map(([id]) => id);
  for (const id of Object.keys(roster.playersById ?? {})) if (!ids.includes(id)) ids.push(id);
  return ids;
}

function buildSingleRosterEvents(
  state: AppState,
  rosterMap: AppState['rosters'],
  specs: PlayerSpec[],
  options: { name: string; desiredRosterId?: string | null },
): KnownAppEvent[] {
  if (specs.length === 0) return [];
  const trimmedName = options.name?.trim();
  const rosterName = trimmedName && trimmedName.length > 0 ? trimmedName : 'Single Player';
  const desiredIdInput = options.desiredRosterId ?? null;
  const desiredId = typeof desiredIdInput === 'string' ? desiredIdInput.trim() : null;
  const activeIdInput = state.activeSingleRosterId ?? null;
  const activeId = typeof activeIdInput === 'string' ? activeIdInput.trim() : null;

  const pickExisting = (candidate: string | null) => {
    if (!candidate) return null;
    const existing = rosterMap[candidate];
    return existing && existing.type === 'single' ? { id: candidate, roster: existing } : null;
  };

  const activeRoster = pickExisting(activeId);
  const desiredRoster = pickExisting(desiredId);

  let targetId: string;
  let baseline: AppState['rosters'][string] | null = null;
  if (activeRoster) {
    targetId = activeRoster.id;
    baseline = activeRoster.roster;
  } else if (desiredRoster) {
    targetId = desiredRoster.id;
    baseline = desiredRoster.roster;
  } else {
    const preferredId = desiredId && !rosterMap[desiredId] ? desiredId : null;
    targetId = preferredId ?? `sp-${uuid()}`;
    // Avoid collisions with any existing roster ids.
    while (rosterMap[targetId]) {
      targetId = `sp-${uuid()}`;
    }
  }

  const eventsList: KnownAppEvent[] = [];
  if (!baseline) {
    eventsList.push(events.rosterCreated({ rosterId: targetId, name: rosterName, type: 'single' }));
  } else {
    eventsList.push(events.rosterReset({ rosterId: targetId }));
    if (baseline.name !== rosterName) {
      eventsList.push(events.rosterRenamed({ rosterId: targetId, name: rosterName }));
    }
  }

  for (const spec of specs) {
    eventsList.push(
      events.rosterPlayerAdded({
        rosterId: targetId,
        id: spec.id,
        name: spec.name,
        type: spec.type,
      }),
    );
  }

  eventsList.push(
    events.rosterPlayersReordered({
      rosterId: targetId,
      order: specs.map((spec) => spec.id),
    }),
  );
  eventsList.push(events.rosterActivated({ rosterId: targetId, mode: 'single' }));

  return eventsList;
}

export default function SinglePlayerNewPageClient() {
  const router = useRouter();
  const { state, ready, appendMany } = useAppState();
  const pathname = usePathname();
  const [cleared, setCleared] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);
  const [clearError, setClearError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [pendingAction, setPendingAction] = React.useState<'roster' | 'create' | null>(null);

  const targetRoute = React.useMemo(
    () => resolveSinglePlayerRoute(state, { fallback: 'new' }),
    [state],
  );
  const players = React.useMemo(() => selectPlayersOrdered(state), [state]);
  const rosterSummaries = React.useMemo(
    () =>
      selectAllRosters(state)
        .filter((roster) => !roster.archived)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state],
  );
  const rosterMap = state.rosters;

  const [selectedRosterId, setSelectedRosterId] = React.useState<string | null>(null);
  const playerCountOptions = React.useMemo(
    () => Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, idx) => MIN_PLAYERS + idx),
    [],
  );
  const [playerCount, setPlayerCount] = React.useState(playerCountOptions[0]!);
  const playerCountRef = React.useRef(playerCount);

  React.useEffect(() => {
    playerCountRef.current = playerCount;
  }, [playerCount]);

  React.useEffect(() => {
    if (selectedRosterId || rosterSummaries.length === 0) return;
    setSelectedRosterId(rosterSummaries[0]!.rosterId);
  }, [rosterSummaries, selectedRosterId]);

  React.useEffect(() => {
    if (!ready) return;
    if (!targetRoute) return;
    if (targetRoute === '/single-player/new') return;
    if (pathname && pathname === targetRoute) return;
    router.replace(targetRoute);
  }, [pathname, ready, router, targetRoute]);

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
        const eventBatch = [...removalEvents, events.playersReordered({ order: [] })];
        const activeSingleRosterId = state.activeSingleRosterId;
        if (activeSingleRosterId && rosterMap[activeSingleRosterId]) {
          eventBatch.push(events.rosterReset({ rosterId: activeSingleRosterId }));
        }
        await appendMany(eventBatch);
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
  }, [appendMany, cleared, clearing, players, ready, rosterMap, state.activeSingleRosterId]);

  const rosterPlayers = React.useMemo(() => {
    if (!selectedRosterId) return [];
    const roster = rosterMap[selectedRosterId];
    if (!roster) return [];
    const order = orderedRosterIds(roster);
    return order.map((id, index) => ({
      id,
      name: roster.playersById?.[id] ?? id,
      type: index === 0 ? 'human' : roster.playerTypesById?.[id] === 'human' ? 'human' : 'bot',
    }));
  }, [rosterMap, selectedRosterId]);

  const actionPending = pendingAction !== null;
  const awaitingSession =
    ready && targetRoute !== '/single-player/new' && pathname != null && targetRoute !== pathname;
  const disabled = actionPending || clearing || !cleared || awaitingSession;
  const countButtonsDisabled = actionPending || clearing || awaitingSession;

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
    if (order.length < MIN_PLAYERS) {
      setSubmitError('Single player games require at least two players.');
      return;
    }
    if (order.length > MAX_PLAYERS) {
      setSubmitError(`Single player games support a maximum of ${MAX_PLAYERS} players.`);
      return;
    }
    setPendingAction('roster');
    setSubmitError(null);
    try {
      const specs: PlayerSpec[] = order.map((id, index) => {
        const baseType = roster.playerTypesById?.[id];
        const type: 'human' | 'bot' =
          index === 0 ? 'human' : baseType === 'human' ? 'human' : 'bot';
        return {
          id,
          name: roster.playersById?.[id] ?? id,
          type,
        };
      });
      const seedEvent = events.spSeedSet({ seed: Math.max(1, Math.floor(Date.now())) });
      const rosterEvents = buildSingleRosterEvents(state, rosterMap, specs, {
        name: roster.name,
        desiredRosterId: state.activeSingleRosterId ?? `sp-${selectedRosterId}`,
      });
      const addEvents = specs.map(({ id, name, type }) =>
        events.playerAdded({
          id,
          name,
          type,
        }),
      );
      const reorder = events.playersReordered({ order });
      const humanId = specs.find((spec) => spec.type === 'human')?.id ?? null;
      const batch: KnownAppEvent[] = [seedEvent, ...rosterEvents, ...addEvents, reorder];
      if (humanId) batch.push(events.spHumanSet({ id: humanId }));
      await appendMany(batch);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Unable to load roster: ${String(error)}`;
      setSubmitError(message);
      setPendingAction(null);
    }
  }, [appendMany, rosterMap, selectedRosterId, state]);

  const handleCreatePlayers = React.useCallback(async () => {
    const count = playerCountRef.current;
    if (!Number.isFinite(count) || count < MIN_PLAYERS || count > MAX_PLAYERS) {
      setSubmitError(`Choose between ${MIN_PLAYERS} and ${MAX_PLAYERS} players.`);
      return;
    }
    setPendingAction('create');
    setSubmitError(null);
    try {
      const seedEvent = events.spSeedSet({ seed: Math.max(1, Math.floor(Date.now())) });
      const specs: PlayerSpec[] = Array.from({ length: count }).map((_, idx) => {
        const id = uuid();
        const type: 'human' | 'bot' = idx === 0 ? 'human' : 'bot';
        const name = idx === 0 ? 'You' : `Bot ${idx}`;
        return { id, name, type };
      });
      const rosterEvents = buildSingleRosterEvents(state, rosterMap, specs, {
        name: 'Single Player',
        desiredRosterId: state.activeSingleRosterId,
      });
      const addEvents = specs.map(({ id, name, type }) =>
        events.playerAdded({
          id,
          name,
          type,
        }),
      );
      const reorder = events.playersReordered({ order: specs.map((spec) => spec.id) });
      const humanId = specs.find((spec) => spec.type === 'human')?.id ?? null;
      const batch: KnownAppEvent[] = [seedEvent, ...rosterEvents, ...addEvents, reorder];
      if (humanId) batch.push(events.spHumanSet({ id: humanId }));
      await appendMany(batch);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Unable to create players: ${String(error)}`;
      setSubmitError(message);
      setPendingAction(null);
    }
  }, [appendMany, playerCountRef, rosterMap, state]);

  const showRosterList = rosterPlayers.length > 0;

  return (
    <div className={styles.container}>
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent className={styles.dialog} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Set up your new single-player game</DialogTitle>
            <DialogDescription>
              Load a saved roster or generate bots before diving into your next run.
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
                <h2>Create a new lineup</h2>
                <p>Select how many seats to fill; bots join automatically.</p>
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
                          playerCountRef.current = count;
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
                    Creating lineup…
                  </>
                ) : (
                  'Create lineup'
                )}
              </Button>
            </section>

            <section className={styles.section}>
              <header className={styles.sectionHeader}>
                <h2>Load an existing roster</h2>
                <p>Copy a saved lineup into this single-player session.</p>
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
                      {rosterPlayers.map((player, index) => (
                        <li key={player.id}>
                          <Users aria-hidden="true" className={styles.rosterIcon} />
                          <span>{player.name}</span>
                          <span className={styles.rosterType}>
                            {index === 0 ? 'You' : player.type === 'bot' ? 'Bot' : 'Human'}
                          </span>
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
                  Preparing your game…
                </>
              ) : pendingAction === 'roster' ? (
                <>
                  <Loader2 className={styles.spinner} aria-hidden="true" />
                  Loading roster…
                </>
              ) : pendingAction === 'create' ? (
                <>
                  <Loader2 className={styles.spinner} aria-hidden="true" />
                  Creating lineup…
                </>
              ) : awaitingSession ? (
                'Waiting for your new game…'
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
