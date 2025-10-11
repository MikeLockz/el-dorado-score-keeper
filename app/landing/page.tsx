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

      {/* Modes Grid */}
      <section aria-label="Modes" className={styles.modesGrid}>
        <ModeCard
          icon={<Compass />}
          title="Single Player"
          description="Play against the computer. Practice strategies and unlock achievements."
          primary={
            singlePlayerActive
              ? {
                  label: 'Resume Game',
                  href: singlePlayerResumeHref,
                  ariaLabel: 'Resume single player game',
                  disabled: newGamePending,
                }
              : {
                  label: 'New Game',
                  onClick: () => void handleStartNew('single'),
                  pending: newGamePending,
                  ariaLabel: 'Start a new single player game',
                }
          }
          secondary={
            singlePlayerActive
              ? {
                  label: 'Start a new game',
                  onClick: () => void handleStartNew('single'),
                  disabled: newGamePending,
                  pending: newGamePending,
                  ariaLabel: 'Archive current single player game and start over',
                }
              : null
          }
          ariaLabel="Single player mode actions"
        />
        <ModeCard
          icon={<Flame />}
          title="Multiplayer"
          description="Host a room or join with a code. Cross‑device, real‑time play."
          primary={{ label: 'Host', href: '#', ariaLabel: 'Host Game (coming soon)' }}
          primaryEvent="mode_multiplayer_host_clicked"
          secondary={{ label: 'Join by code', href: '/rules' }}
          ariaLabel="Open multiplayer — host a room or join by code."
        />
        <ModeCard
          icon={<Calculator />}
          title="Score Card"
          description="Track scores for in‑person sessions. Share and export results."
          primary={
            scorecardActive
              ? {
                  label: 'Resume Score Card',
                  href: scorecardResumeHref,
                  ariaLabel: 'Resume current score card',
                  disabled: newGamePending,
                }
              : {
                  label: 'New Score Card',
                  onClick: () => void handleStartNew('scorecard'),
                  pending: newGamePending,
                  ariaLabel: 'Start a new score card',
                }
          }
          secondary={
            scorecardActive
              ? {
                  label: 'Start a new score card',
                  onClick: () => void handleStartNew('scorecard'),
                  disabled: newGamePending,
                  pending: newGamePending,
                  ariaLabel: 'Archive current score card and start over',
                }
              : null
          }
          ariaLabel="Open score card for in-person tallying"
          primaryEvent="mode_scorecard_open_clicked"
        />
      </section>

      {/* Quick Links */}
      <QuickLinks />
    </div>
  );
}
