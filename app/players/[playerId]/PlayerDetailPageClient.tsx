'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { Button, Card } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import { assertEntityAvailable, selectPlayerById, resolvePlayerRoute } from '@/lib/state';
import { trackPlayerDetailView } from '@/lib/observability/events';
import { shareLink } from '@/lib/ui/share';
import { useToast } from '@/components/ui/toast';

import PlayerMissing from '../_components/PlayerMissing';
import styles from './page.module.scss';

export type PlayerDetailPageClientProps = {
  playerId: string;
};

export function PlayerDetailPageClient({ playerId }: PlayerDetailPageClientProps) {
  const router = useRouter();
  const { state, ready } = useAppState();
  const { toast } = useToast();

  const playerSlice = React.useMemo(() => selectPlayerById(state, playerId), [state, playerId]);
  const availability = React.useMemo(
    () =>
      ready
        ? assertEntityAvailable(playerSlice, 'player', {
            id: playerId,
            archived: playerSlice?.archived ?? false,
          })
        : null,
    [ready, playerSlice, playerId],
  );
  const sharePlayerName = playerSlice?.name ?? playerId;

  React.useEffect(() => {
    if (!ready) return;
    if (!availability || availability.status !== 'found') return;
    trackPlayerDetailView({
      playerId,
      archived: availability.entity?.detail?.archived ?? false,
      source: 'players.detail.page',
    });
  }, [ready, availability, playerId]);

  const handleCopyLink = React.useCallback(async () => {
    await shareLink({
      href: resolvePlayerRoute(playerId),
      toast,
      title: sharePlayerName || 'Player detail',
      successMessage: 'Player link copied',
    });
  }, [playerId, sharePlayerName, toast]);

  if (!ready) {
    return (
      <div className={styles.container}>
        <div className={styles.spinnerRow} role="status" aria-live="polite">
          <Loader2 className={styles.spinner} aria-hidden="true" />
          Loading player…
        </div>
      </div>
    );
  }

  if (!availability || availability.status !== 'found') {
    return <PlayerMissing />;
  }

  const detail = availability.entity;
  const archived = detail?.detail?.archived ?? false;
  const archivedAt = detail?.detail?.archivedAt ?? null;
  const type = detail?.detail?.type ?? 'human';

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{detail?.name ?? detail?.id}</h1>
        <div className={styles.meta}>Player ID: {detail?.id}</div>
        <div className={styles.actions}>
          <Button variant="outline" onClick={() => router.push(resolvePlayerRoute(null))}>
            Manage players
          </Button>
          {archived ? (
            <Button
              variant="outline"
              onClick={() => router.push(resolvePlayerRoute(null, { fallback: 'archived' }))}
            >
              View archived list
            </Button>
          ) : null}
        </div>
      </header>

      <Card className={styles.section}>
        <div className={styles.sectionHeading}>Player details</div>
        <div className={styles.valueRow}>
          <span>Type</span>
          <span className={styles.badge}>{type === 'bot' ? 'Bot' : 'Human'}</span>
        </div>
        <div className={styles.valueRow}>
          <span>Status</span>
          <span className={styles.badge}>{archived ? 'Archived' : 'Active'}</span>
        </div>
        {archivedAt ? (
          <div className={styles.valueRow}>
            <span>Archived at</span>
            <span>{new Date(archivedAt).toLocaleString()}</span>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export default PlayerDetailPageClient;
