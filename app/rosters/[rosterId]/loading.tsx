import { Loader2 } from 'lucide-react';

import styles from './page.module.scss';

export default function RosterDetailLoading() {
  return (
    <div className={styles.container}>
      <div className={styles.spinnerRow} role="status" aria-live="polite">
        <Loader2 className={styles.spinner} aria-hidden="true" />
        Loading roster…
      </div>
    </div>
  );
}
