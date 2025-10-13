import type { Metadata } from 'next';

import ScorecardHubPageClient from './ScorecardHubPageClient';

export const metadata: Metadata = {
  title: 'Scorecard hub',
  description: 'Select a scorecard session to edit bids, track rounds, or open summaries.',
};

export default function ScorecardPage() {
  return <ScorecardHubPageClient />;
}
