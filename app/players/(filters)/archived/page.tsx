'use client';

import React from 'react';
import Link from 'next/link';

import { Button, Card, BackLink } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import { selectArchivedPlayers } from '@/lib/state';
import { trackPlayersView } from '@/lib/observability/events';
import { PlayersTable } from '@/components/players/PlayersTable';

import styles from './page.module.scss';

export default function ArchivedPlayersPage() {
  const { state } = useAppState();
  const archivedPlayers = React.useMemo(() => {
    return selectArchivedPlayers(state);
  }, [state]);

  React.useEffect(() => {
    trackPlayersView({ filter: 'archived', source: 'players.archived.page' });
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h1 className={styles.title}>Archived Players</h1>
            <p className={styles.description}>Previously saved players that have been archived.</p>
          </div>
        </div>
        <Card>
          <PlayersTable players={archivedPlayers} showArchived={true} />
        </Card>
        <BackLink href="/players">Back to Players</BackLink>
      </div>
    </div>
  );
}
