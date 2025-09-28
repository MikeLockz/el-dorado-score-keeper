import { Card } from '@/components/ui';

import styles from './page.module.scss';

export default function RulesPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Rules</h1>
      <div className={styles.sections}>
        <Card className={styles.sectionCard}>
          <h2 className={styles.sectionHeading}>Overview</h2>
          <p className={styles.sectionBody}>
            The app tracks a 10-round session. Each round has a target number of tricks that
            decreases from 10 to 1. Players bid during the bidding phase, then you mark whether they
            made or missed during completion. Finalizing a round applies points based on the bid and
            outcome.
          </p>
        </Card>
        <Card className={styles.sectionCard}>
          <h2 className={styles.sectionHeading}>Round Flow</h2>
          <ol className={styles.sectionListOrdered}>
            <li>
              <span className={styles.listLabel}>Bidding</span>: Each player sets a bid from 0 up to
              the round’s trick count. Bidding proceeds in table order starting with the player after
              the dealer; the dealer bids last. This is the same order as who plays first in the
              round.
            </li>
            <li>
              <span className={styles.listLabel}>Complete</span>: After play, mark for each player
              whether they made or missed.
            </li>
            <li>
              <span className={styles.listLabel}>Finalize</span>: When all players are marked, click
              the round tile to finalize.
            </li>
            <li>
              <span className={styles.listLabel}>Next Round</span>: The next locked round
              automatically unlocks into bidding.
            </li>
          </ol>
        </Card>
        <Card className={styles.sectionCard}>
          <h2 className={styles.sectionHeading}>Scoring</h2>
          <ul className={styles.sectionListUnordered}>
            <li>Made: + (5 + bid) points</li>
            <li>Missed: − (5 + bid) points</li>
            <li>Totals update immediately on finalization and appear on the scoreboard.</li>
          </ul>
        </Card>
        <Card className={styles.sectionCard}>
          <h2 className={styles.sectionHeading}>Examples</h2>
          <ul className={styles.sectionListUnordered}>
            <li>Bid 3 and made: +8 points</li>
            <li>Bid 0 and missed: −5 points</li>
            <li>Bid 7 and missed: −12 points</li>
          </ul>
        </Card>
        <Card className={styles.sectionCard}>
          <h2 className={styles.sectionHeading}>Notes</h2>
          <ul className={styles.sectionListUnordered}>
            <li>Round states: locked → bidding → complete → scored → bidding (cycle).</li>
            <li>Locked rounds cannot be advanced until earlier rounds are scored.</li>
            <li>Data is stored locally and syncs across open tabs.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
