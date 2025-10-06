'use client';

import React from 'react';
import Link from 'next/link';

import { Button, Card } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import { selectAllRosters } from '@/lib/state';
import { trackRostersView } from '@/lib/observability/events';

import styles from './page.module.scss';

export default function RostersPage() {
  const { state } = useAppState();
  const rosters = selectAllRosters(state);
  const active = rosters.filter((roster) => !roster.archived);

  React.useEffect(() => {
    trackRostersView({ filter: 'active', source: 'rosters.page' });
  }, []);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Rosters</h1>
          <p className={styles.description}>Manage saved lineups for scorecard and single-player modes.</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/players">Manage via Players hub</Link>
        </Button>
      </header>
      {active.length === 0 ? (
        <p className={styles.emptyState}>No active rosters yet. Use the Players hub to create one.</p>
      ) : (
        <div className={styles.list}>
          {active.map((roster) => (
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
        <Link href="/rosters/archived">Browse archived rosters</Link>
      </Button>
    </div>
  );
}
