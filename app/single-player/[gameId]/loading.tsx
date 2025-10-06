import { Loader2 } from 'lucide-react';

import styles from './layout.module.scss';

export default function SinglePlayerGameLoading() {
  return (
    <div className={styles.loading}>
      <Loader2 className={styles.spinner} aria-hidden="true" />
      Loading single player…
    </div>
  );
}
