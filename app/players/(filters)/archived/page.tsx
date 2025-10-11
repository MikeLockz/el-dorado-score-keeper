'use client';

import React from 'react';

import PlayerManagement from '@/components/players/PlayerManagement';
import { trackPlayersView } from '@/lib/observability/events';

export default function ArchivedPlayersPage() {
  React.useEffect(() => {
    trackPlayersView({ filter: 'archived', source: 'players.archived.page' });
  }, []);

  return <PlayerManagement defaultPlayerView="archived" />;
}
