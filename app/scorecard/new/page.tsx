import type { Metadata } from 'next';

import ScorecardNewPageClient from './ScorecardNewPageClient';

export const metadata: Metadata = {
  title: 'New scorecard setup',
  description:
    'Choose how to populate your new scorecard by loading an existing roster or creating new players.',
};

export default function ScorecardNewPage() {
  return <ScorecardNewPageClient />;
}
