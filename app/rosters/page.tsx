'use client';

import React from 'react';

import { Button, Card, BackLink } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import { selectAllRosters } from '@/lib/state';
import { trackRostersView } from '@/lib/observability/events';
import { RostersTable } from '@/components/rosters/RostersTable';
import { Plus } from 'lucide-react';
import { events } from '@/lib/state';
import { uuid } from '@/lib/utils';

import styles from './page.module.scss';

export default function RostersPage() {
  const { state, ready, append } = useAppState();
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    trackRostersView({ filter: 'active', source: 'rosters.page' });
  }, []);

  React.useEffect(() => {
    // Only show loading while the app state is getting ready
    if (ready) {
      setIsLoading(false);
    }
  }, [ready]);

  const rosters = selectAllRosters(state);
  const active = rosters.filter((roster) => !roster.archived);

  // Force re-render when rosters change
  const [key, setKey] = React.useState(0);
  const handleRostersChange = React.useCallback(() => {
    setKey((prev) => prev + 1);
  }, []);

  // Recalculate active rosters when state or key changes
  const currentActive = React.useMemo(() => {
    return selectAllRosters(state).filter((roster) => !roster.archived);
  }, [state, key]);

  const handleCreateNewRoster = async () => {
    const rosterCount = currentActive.length;
    const newRosterName = `Roster ${rosterCount + 1}`;
    const rosterId = uuid();

    await append(
      events.rosterCreated({
        rosterId,
        name: newRosterName,
        // No type field needed - rosters are just player collections
      }),
    );
    handleRostersChange();
  };

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
          <Button onClick={() => void handleCreateNewRoster()} className={styles.newRosterButton}>
            <Plus aria-hidden="true" /> Create New Roster
          </Button>
        </div>
        <Card>
          <RostersTable
            rosters={currentActive}
            onRostersChange={handleRostersChange}
            loading={isLoading}
          />
        </Card>
        <BackLink href="/rosters/archived">Browse archived rosters</BackLink>
      </div>
    </div>
  );
}
