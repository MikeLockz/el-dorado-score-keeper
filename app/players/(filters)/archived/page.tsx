'use client';

import React from 'react';

import { PlayersTable } from '@/components/players/PlayersTable';
import { useAppState } from '@/components/state-provider';
import { selectArchivedPlayers } from '@/lib/state';
import { trackPlayersView } from '@/lib/observability/events';
import { Card } from '@/components/ui';

import styles from '../../page.module.scss';

export default function ArchivedPlayersPage() {
  const { state } = useAppState();

  React.useEffect(() => {
    trackPlayersView({ filter: 'archived', source: 'players.archived.page' });
  }, []);

  const archivedPlayers = React.useMemo(() => {
    return selectArchivedPlayers(state);
  }, [state]);

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Archived Players</h2>
        <p className={styles.sectionDescription}>View and manage all archived players.</p>
        <Card>
          <PlayersTable players={archivedPlayers} showArchived={true} />
        </Card>
      </div>
    </div>
  );
}
