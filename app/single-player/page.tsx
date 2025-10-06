import type { Metadata } from 'next';
import { Loader2 } from 'lucide-react';

import styles from './page.module.scss';

export const metadata: Metadata = {
  title: 'Single Player',
  description: 'Loading your latest single-player session.',
};

export default function SinglePlayerRootPage() {
  return (
    <div className={styles.loadingScreen}>
      <div className={styles.loadingStatus} role="status" aria-live="polite">
        <Loader2 className={styles.spinner} aria-hidden="true" />
        Loading single player…
      </div>
    </div>
  );
}
