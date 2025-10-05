'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';
import { logEvent } from '@/lib/client-log';

import styles from './hero-ctas.module.scss';

export default function HeroCtas() {
  return (
    <div className={styles.heroCtas}>
      <Button asChild>
        <Link
          href="/single-player"
          aria-label="Start Single Player"
          onClick={() => logEvent('hero_start_single_clicked')}
        >
          Start Single Player
        </Link>
      </Button>
    </div>
  );
}
