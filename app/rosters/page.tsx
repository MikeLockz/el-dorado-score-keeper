'use client';

import React from 'react';
import Link from 'next/link';

import { Button, Card, BackLink } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import { selectAllRosters } from '@/lib/state';
import { trackRostersView } from '@/lib/observability/events';
import { RostersTable } from '@/components/rosters/RostersTable';
import { Plus } from 'lucide-react';

import styles from './page.module.scss';

export default function RostersPage() {
  const { state, ready } = useAppState();
  const rosters = selectAllRosters(state);
  const active = rosters.filter((roster) => !roster.archived);

  // Force re-render when rosters change
  const [key, setKey] = React.useState(0);
  const handleRostersChange = React.useCallback(() => {
    setKey((prev) => prev + 1);
  }, []);

  React.useEffect(() => {
    trackRostersView({ filter: 'active', source: 'rosters.page' });
  }, []);

  // Recalculate active rosters when state or key changes
  const currentActive = React.useMemo(() => {
    return selectAllRosters(state).filter((roster) => !roster.archived);
  }, [state, key]);

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h1 className={styles.title}>Rosters</h1>
            <p className={styles.description}>
              Manage saved lineups for scorecard and single-player modes.
            </p>
          </div>
          <Button asChild>
            <Link href="/rosters/new">
              <Plus aria-hidden="true" /> Create New Roster
            </Link>
          </Button>
        </div>
        <Card>
          <RostersTable rosters={currentActive} onRostersChange={handleRostersChange} />
        </Card>
        <BackLink href="/rosters/archived">Browse archived rosters</BackLink>
      </div>
    </div>
  );
}
