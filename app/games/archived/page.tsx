'use client';

import React from 'react';

import { Button, Card, BackLink } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import { listArchivedGames, isGameRecordCompleted } from '@/lib/state';
import { trackGamesListView } from '@/lib/observability/events';
import { GamesTable } from '@/components/games';

import styles from './page.module.scss';

export default function ArchivedGamesPage() {
  const [games, setGames] = React.useState<Array<any> | null>(null);
  const { state } = useAppState();

  const loadGames = React.useCallback(async () => {
    try {
      const list = await listArchivedGames();
      // Sort by archived date
      const archivedGames = list.sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
      setGames(archivedGames);
    } catch (error) {
      console.error('Failed to load archived games:', error);
      setGames([]);
    }
  }, []);

  React.useEffect(() => {
    void loadGames();
  }, [loadGames]);

  React.useEffect(() => {
    trackGamesListView({ source: 'games.archived.page' });
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h1 className={styles.title}>Archived Games</h1>
            <p className={styles.description}>
              Previously completed games that have been archived.
            </p>
          </div>
        </div>
        <Card>
          <GamesTable games={games} loading={games === null} onGamesChange={loadGames} />
        </Card>
        <BackLink href="/games">Back to Games</BackLink>
      </div>
    </div>
  );
}
