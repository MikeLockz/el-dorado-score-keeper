'use client';

import React from 'react';

import { PlayerManagement } from '@/components/players';
import { PlayersTable } from '@/components/players/PlayersTable';
import { trackPlayersView } from '@/lib/observability/events';
import { Card } from '@/components/ui';

import styles from './page.module.scss';

export default function PlayersPage() {
  React.useEffect(() => {
    trackPlayersView({ filter: 'active', source: 'players.page' });
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Player Management</h2>
        <p className={styles.sectionDescription}>
          Add, remove, and manage players with drag-and-drop reordering.
        </p>
        <PlayerManagement />
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Active Players Table</h2>
        <p className={styles.sectionDescription}>
          View and manage all active players in a sortable table format.
        </p>
        <Card>
          <PlayersTable />
        </Card>
      </div>
    </div>
  );
}
