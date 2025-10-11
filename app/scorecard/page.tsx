import type { Metadata } from 'next';

import styles from './page.module.scss';

export const metadata: Metadata = {
  title: 'Scorecard hub',
  description: 'Select a scorecard session to edit bids, track rounds, or open summaries.',
};

export default function ScorecardPage() {
  return (
    <div className={styles.container}>
      <div className={styles.status}>Select a scorecard to view its details.</div>
    </div>
  );
}
