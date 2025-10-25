'use client';

import React from 'react';
import Link from 'next/link';

import { Button, Card, BackLink } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import { selectAllRosters } from '@/lib/state';
import { trackRostersView } from '@/lib/observability/events';
import { RostersTable } from '@/components/rosters/RostersTable';

import styles from './page.module.scss';

export default function ArchivedRostersPage() {
  const { state } = useAppState();
  const archivedRosters = React.useMemo(() => {
    return selectAllRosters(state).filter((roster) => roster.archived);
  }, [state]);

  React.useEffect(() => {
    trackRostersView({ filter: 'archived', source: 'rosters.archived.page' });
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h1 className={styles.title}>Archived Rosters</h1>
            <p className={styles.description}>Previously saved lineups that have been archived.</p>
          </div>
        </div>
        <Card>
          <RostersTable rosters={archivedRosters} emptyMessage="No archived rosters found." />
        </Card>
        <BackLink href="/rosters">Back to active rosters</BackLink>
      </div>
    </div>
  );
}
