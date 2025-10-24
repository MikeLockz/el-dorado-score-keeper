'use client';

import React from 'react';

import { PlayersTable } from '@/components/players/PlayersTable';
import { trackPlayersView } from '@/lib/observability/events';
import { Card, Button } from '@/components/ui';
import { Plus } from 'lucide-react';
import { useAppState } from '@/components/state-provider';
import { uuid } from '@/lib/utils';
import { events } from '@/lib/state';
import { trackPlayersAdded } from '@/lib/observability/events';
import Link from 'next/link';

import styles from './page.module.scss';

export default function PlayersPage() {
  const { append, state } = useAppState();

  React.useEffect(() => {
    trackPlayersView({ filter: 'active', source: 'players.page' });
  }, []);

  const handleAddNewPlayer = async () => {
    const playerCount = Object.keys(state.players || {}).length;
    if (playerCount >= 10) return;

    const newPlayerName = `Player ${playerCount + 1}`;
    const id = uuid();

    await append(events.playerAdded({ id, name: newPlayerName }));
    trackPlayersAdded({
      addedCount: 1,
      totalPlayers: Math.max(0, playerCount + 1),
      inputMethod: 'quick-add-button',
      source: 'players.page.active-table',
      mode: 'scorecard',
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h1 className={styles.title}>Players</h1>
            <p className={styles.description}>
              Manage active players, edit names and types, and view player statistics.
            </p>
          </div>
          <Button
            onClick={() => void handleAddNewPlayer()}
            disabled={Object.keys(state.players || {}).length >= 10}
            className={styles.newPlayerButton}
          >
            <Plus aria-hidden="true" /> New Player
          </Button>
        </div>
        <Card>
          <PlayersTable />
        </Card>
        <div className={styles.archivedLinkContainer}>
          <Link href="/players/archived" className={styles.archivedLink}>
            View Archived Players
          </Link>
        </div>
      </div>
    </div>
  );
}
