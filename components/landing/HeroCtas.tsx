'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';
import { logEvent } from '@/lib/client-log';
import { useAppState } from '@/components/state-provider';
import { resolveSinglePlayerRoute } from '@/lib/state';

import styles from './hero-ctas.module.scss';

export default function HeroCtas() {
  const { state } = useAppState();
  const singlePlayerHref = resolveSinglePlayerRoute(state, { fallback: 'entry' });
  return (
    <div className={styles.heroCtas}>
      <Button asChild>
        <Link
          href={singlePlayerHref}
          aria-label="Start Single Player"
          onClick={() => logEvent('hero_start_single_clicked')}
        >
          Start Single Player
        </Link>
      </Button>
    </div>
  );
}
