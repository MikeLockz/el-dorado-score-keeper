'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import ModeCard from '@/components/landing/ModeCard';
import { Compass, Flame, Calculator } from 'lucide-react';
import QuickLinks from '@/components/landing/QuickLinks';
import HeroCtas from '@/components/landing/HeroCtas';
import { useAppState } from '@/components/state-provider';
import { useNewGameRequest, hasScorecardProgress, hasSinglePlayerProgress } from '@/lib/game-flow';
import { resolveScorecardRoute, resolveSinglePlayerRoute } from '@/lib/state';

import styles from './page.module.scss';

export default function LandingPage() {
  const router = useRouter();
  const { state } = useAppState();
  const requestedModeRef = React.useRef<'single' | 'scorecard' | null>(null);
  const handleNavigateToMode = React.useCallback(() => {
    const mode = requestedModeRef.current;
    if (!mode) return;
    requestedModeRef.current = null;
    if (mode === 'single') {
      router.push(resolveSinglePlayerRoute(state, { fallback: 'entry' }));
    } else {
      router.push(resolveScorecardRoute(state));
    }
  }, [router, state]);
  const { startNewGame, pending: newGamePending } = useNewGameRequest({
    onSuccess: handleNavigateToMode,
    onCancelled: handleNavigateToMode,
    analytics: { source: 'landing' },
  });

  const singlePlayerActive = hasSinglePlayerProgress(state);
  const scorecardActive = hasScorecardProgress(state);

  const handleStartNew = React.useCallback(
    async (mode: 'single' | 'scorecard') => {
      if (newGamePending) return;
      requestedModeRef.current = mode;
      const ok = await startNewGame({
        analytics: {
          mode: mode === 'single' ? 'single-player' : 'scorecard',
          source: mode === 'single' ? 'landing.single' : 'landing.scorecard',
        },
      });
      if (!ok && requestedModeRef.current === mode) {
        requestedModeRef.current = null;
        if (mode === 'single') {
          router.push(resolveSinglePlayerRoute(state, { fallback: 'entry' }));
        } else {
          router.push(resolveScorecardRoute(state));
        }
      }
    },
    [newGamePending, router, startNewGame, state],
  );

  const singlePlayerResumeHref = React.useMemo(
    () => resolveSinglePlayerRoute(state, { fallback: 'entry' }),
    [state],
  );
  const scorecardResumeHref = React.useMemo(() => resolveScorecardRoute(state), [state]);

  return (
    <div className={styles.container}>
      {/* Hero */}
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>Set Out for El Dorado</h1>
        <p className={styles.heroCopy}>
          A card game from south western Michigan.
        </p>
        <HeroCtas />
      </section>

      

      {/* Quick Links */}
      <QuickLinks />
    </div>
  );
}
