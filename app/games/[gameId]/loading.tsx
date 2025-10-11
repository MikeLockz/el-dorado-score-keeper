import { Loader2 } from 'lucide-react';

import styles from './page.module.scss';

export default function GameDetailLoading() {
  return (
    <div className={styles.page}>
      <div className={styles.feedback} role="status" aria-live="polite">
        <Loader2 className={styles.spinner} aria-hidden="true" />
        Loading game…
      </div>
    </div>
  );
}
