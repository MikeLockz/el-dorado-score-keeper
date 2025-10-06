'use client';

import React from 'react';
import { useRouter, useSelectedLayoutSegments } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { useAppState } from '@/components/state-provider';
import { hasSinglePlayerProgress } from '@/lib/game-flow';
import { getCurrentSinglePlayerGameId, singlePlayerPath } from '@/lib/state';

import styles from './page.module.scss';

export default function SinglePlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const segments = useSelectedLayoutSegments();
  const isRootRoute = segments.length === 0;
  const router = useRouter();
  const { state, ready } = useAppState();
  const redirectRef = React.useRef(false);
  const [hasRedirected, setHasRedirected] = React.useState(false);

  React.useEffect(() => {
    if (!isRootRoute) return;
    if (!ready) return;
    if (redirectRef.current) return;

    const currentId = getCurrentSinglePlayerGameId(state);
    let target: string | null = null;
    if (currentId) {
      target = singlePlayerPath(currentId);
    } else if (hasSinglePlayerProgress(state)) {
      target = '/single-player/new/archive';
    } else {
      target = '/single-player/new';
    }

    if (!target) {
      redirectRef.current = true;
      setHasRedirected(true);
      return;
    }

    redirectRef.current = true;
    void Promise.resolve().then(() => {
      router.replace(target);
      setHasRedirected(true);
    });
  }, [isRootRoute, ready, state, router]);

  if (isRootRoute && (!ready || !hasRedirected)) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingStatus} role="status" aria-live="polite">
          <Loader2 className={styles.spinner} aria-hidden="true" />
          Loading single player…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
