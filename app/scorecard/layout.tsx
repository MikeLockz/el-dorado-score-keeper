'use client';

import React from 'react';
import { useRouter, useSelectedLayoutSegments } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { useAppState } from '@/components/state-provider';
import { getActiveScorecardId } from '@/lib/state';

import styles from './page.module.scss';

export default function ScorecardLayout({ children }: { children: React.ReactNode }) {
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

    const activeId = getActiveScorecardId(state);
    if (!activeId) {
      redirectRef.current = true;
      setHasRedirected(true);
      return;
    }

    redirectRef.current = true;
    void Promise.resolve().then(() => {
      router.replace(`/scorecard/${activeId}`);
      setHasRedirected(true);
    });
  }, [isRootRoute, ready, state, router]);

  if (isRootRoute && (!ready || !hasRedirected)) {
    return (
      <div className={styles.container}>
        <div className={styles.status} role="status" aria-live="polite">
          <Loader2 className={styles.spinner} aria-hidden="true" />
          Preparing scorecard…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
