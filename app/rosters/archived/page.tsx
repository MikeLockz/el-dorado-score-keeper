'use client';

import React from 'react';
import Link from 'next/link';

import { Button, Card } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import { selectAllRosters } from '@/lib/state';
import { trackRostersView } from '@/lib/observability/events';

import styles from './page.module.scss';

export default function ArchivedRostersPage() {
  const { state } = useAppState();
  const rosters = selectAllRosters(state).filter((roster) => roster.archived);

  React.useEffect(() => {
    trackRostersView({ filter: 'archived', source: 'rosters.archived.page' });
  }, []);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Archived Rosters</h1>
          <p className={styles.description}>Previously saved lineups that have been archived.</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/players">Manage via Players hub</Link>
        </Button>
      </header>
      {rosters.length === 0 ? (
        <p className={styles.emptyState}>No archived rosters found.</p>
      ) : (
        <div className={styles.list}>
          {rosters.map((roster) => (
            <Card key={roster.rosterId} className={styles.card}>
              <div className={styles.cardTitle}>{roster.name}</div>
              <div className={styles.meta}>Players: {roster.players}</div>
              <div className={styles.meta}>Mode: <span className={styles.badge}>{roster.type === 'single' ? 'Single Player' : 'Scorecard'}</span></div>
              <Button variant="outline" asChild>
                <Link href={`/rosters/${roster.rosterId}`}>View details</Link>
              </Button>
            </Card>
          ))}
        </div>
      )}
      <Button variant="ghost" asChild>
        <Link href="/rosters">Back to active rosters</Link>
      </Button>
    </div>
  );
}
