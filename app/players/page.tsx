'use client';

import React from 'react';

import { PlayerManagement } from '@/components/players';
import { trackPlayersView } from '@/lib/observability/events';

import styles from './page.module.scss';

export default function PlayersPage() {
  React.useEffect(() => {
    trackPlayersView({ filter: 'active', source: 'players.page' });
  }, []);

  return (
    <div className={styles.container}>
      <PlayerManagement />
    </div>
  );
}
