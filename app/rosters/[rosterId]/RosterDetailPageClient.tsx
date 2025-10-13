'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import {
  assertEntityAvailable,
  selectRosterById,
  resolveRosterRoute,
  resolvePlayerRoute,
} from '@/lib/state';
import { trackRosterDetailView } from '@/lib/observability/events';
import { shareLink } from '@/lib/ui/share';
import { useToast } from '@/components/ui/toast';

import RosterMissing from '../_components/RosterMissing';
import styles from './page.module.scss';

export type RosterDetailPageClientProps = {
  rosterId: string;
};

export function RosterDetailPageClient({ rosterId }: RosterDetailPageClientProps) {
  const router = useRouter();
  const { state, ready } = useAppState();
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
  const shareRosterName = rosterSlice?.roster?.name ?? rosterId;

  React.useEffect(() => {
    if (!ready) return;
    if (!availability || availability.status !== 'found') return;
    trackRosterDetailView({
      rosterId,
      archived: availability.entity?.archived ?? false,
      source: 'rosters.detail.page',
    });
  }, [ready, availability, rosterId]);

  const handleCopyLink = React.useCallback(async () => {
    await shareLink({
      href: resolveRosterRoute(rosterId),
      toast,
      title: shareRosterName || 'Roster detail',
      successMessage: 'Roster link copied',
    });
  }, [rosterId, shareRosterName, toast]);

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

  if (!availability || availability.status !== 'found') {
    return <RosterMissing />;
  }

  const roster = availability.entity?.roster;
  const archived = availability.entity?.archived ?? false;
  const players = roster ? Object.entries(roster.playersById ?? {}) : [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{roster?.name ?? 'Roster'}</h1>
        <div className={styles.meta}>Roster ID: {availability.entity?.id}</div>
        <div className={styles.actions}>
          <Button variant="outline" onClick={() => router.push(resolvePlayerRoute(null))}>
            Manage via Players hub
          </Button>
          {archived ? (
            <Button
              variant="outline"
              onClick={() => router.push(resolveRosterRoute(null, { fallback: 'archived' }))}
            >
              View archived list
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => router.push(resolveRosterRoute(null, { fallback: 'archived' }))}
            >
              Browse archived rosters
            </Button>
          )}
        </div>
      </header>
      <div className={styles.meta}>
        Mode:{' '}
        <span className={styles.badge}>
          {roster?.type === 'single' ? 'Single Player' : 'Scorecard'}
        </span>
      </div>
      <section>
        <h2 className={styles.meta}>Players</h2>
        {players.length === 0 ? (
          <p className={styles.meta}>No players assigned.</p>
        ) : (
          <div className={styles.list}>
            {players.map(([pid, name], index) => (
              <div key={pid} className={styles.playerCard}>
                <div>{name}</div>
                <div className={styles.meta}>#{index + 1}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default RosterDetailPageClient;
