import type { Metadata } from 'next';

import ScorecardHubPageClient from '../../scorecard/ScorecardHubPageClient';

export const metadata: Metadata = {
  title: 'Scorecard archives',
  description: 'Browse archived scorecard sessions from the games library.',
};

export default function GamesScorecardListPage() {
  return <ScorecardHubPageClient variant="games" />;
}
