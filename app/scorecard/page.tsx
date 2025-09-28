import CurrentGame from '@/components/views/CurrentGame';

import styles from './page.module.scss';

export default function ScorecardPage() {
  return (
    <div className={styles.container}>
      <CurrentGame />
    </div>
  );
}
