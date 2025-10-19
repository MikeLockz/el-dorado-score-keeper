'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import ModeCard from '@/components/landing/ModeCard';
import { Compass, Flame, Calculator } from 'lucide-react';
import QuickLinks from '@/components/landing/QuickLinks';
import HeroCtas from '@/components/landing/HeroCtas';
import { useAppState } from '@/components/state-provider';
import { useNewGameRequest, hasScorecardProgress, hasSinglePlayerProgress } from '@/lib/game-flow';
import {
  resolveScorecardRoute,
  resolveSinglePlayerRoute,
  archiveCurrentGameAndReset,
} from '@/lib/state';

import styles from './page.module.scss';

export default function LandingPage() {
  const router = useRouter();
  const { state } = useAppState();
  const requestedModeRef = React.useRef<'single' | 'scorecard' | null>(null);
  const routeToModeFallback = React.useCallback(
    (mode: 'single' | 'scorecard') => {
      if (mode === 'single') {
        router.push(resolveSinglePlayerRoute(state, { fallback: 'entry' }));
      } else {
        router.push(resolveScorecardRoute(state));
      }
    },
    [router, state],
  );
  const handleStartSuccess = React.useCallback(() => {
    const mode = requestedModeRef.current;
    if (!mode) return;
    requestedModeRef.current = null;
    if (mode === 'single') {
      router.push('/single-player/new');
    } else {
      router.push('/scorecard/new');
    }
  }, [router]);
  const handleStartCancelled = React.useCallback(() => {
    const mode = requestedModeRef.current;
    if (!mode) return;
    requestedModeRef.current = null;
    routeToModeFallback(mode);
  }, [routeToModeFallback]);
  const { startNewGame, pending: newGamePending } = useNewGameRequest({
    onSuccess: handleStartSuccess,
    onCancelled: handleStartCancelled,
    analytics: { source: 'landing' },
  });

  const singlePlayerActive = hasSinglePlayerProgress(state);
  const scorecardActive = hasScorecardProgress(state);

  const handleStartNew = React.useCallback(
    async (mode: 'single' | 'scorecard') => {
      if (newGamePending) return;
      await archiveCurrentGameAndReset();
      requestedModeRef.current = mode;
      const ok = await startNewGame({
        analytics: {
          mode: mode === 'single' ? 'single-player' : 'scorecard',
          source: mode === 'single' ? 'landing.single' : 'landing.scorecard',
        },
      });
      if (!ok && requestedModeRef.current === mode) {
        requestedModeRef.current = null;
        routeToModeFallback(mode);
      }
    },
    [newGamePending, routeToModeFallback, startNewGame, state],
  );

  const singlePlayerResumeHref = React.useMemo(
    () => resolveSinglePlayerRoute(state, { fallback: 'entry' }),
    [state],
  );
  const scorecardResumeHref = React.useMemo(() => resolveScorecardRoute(state), [state]);

  const handleHostMultiplayer = React.useCallback(
    async (destination: string) => {
      await archiveCurrentGameAndReset();
      router.push(destination);
    },
    [router],
  );

  const singlePrimaryAction = React.useMemo(
    () =>
      singlePlayerActive
        ? {
            label: 'Resume Game',
            href: singlePlayerResumeHref,
            ariaLabel: 'Resume your in-progress single player game',
          }
        : {
            label: 'New Game',
            onClick: () => void handleStartNew('single'),
            pending: newGamePending,
            disabled: newGamePending,
          },
    [singlePlayerActive, singlePlayerResumeHref, newGamePending, handleStartNew],
  );

  const singleSecondaryAction = React.useMemo(
    () =>
      singlePlayerActive
        ? {
            label: 'Start a new game',
            onClick: () => void handleStartNew('single'),
            pending: newGamePending,
            disabled: newGamePending,
          }
        : null,
    [singlePlayerActive, newGamePending, handleStartNew],
  );

  const scorecardPrimaryAction = React.useMemo(
    () =>
      scorecardActive
        ? {
            label: 'Resume Score Card',
            href: scorecardResumeHref,
            ariaLabel: 'Resume your active score card',
          }
        : {
            label: 'Open',
            onClick: () => void handleStartNew('scorecard'),
            pending: newGamePending,
            disabled: newGamePending,
            ariaLabel: 'Open Score Card',
          },
    [scorecardActive, scorecardResumeHref, newGamePending, handleStartNew],
  );

  const scorecardSecondaryAction = React.useMemo(
    () =>
      scorecardActive
        ? {
            label: 'Start a new score card',
            onClick: () => void handleStartNew('scorecard'),
            pending: newGamePending,
            disabled: newGamePending,
          }
        : null,
    [scorecardActive, newGamePending, handleStartNew],
  );

  return (
    <div className={styles.container}>
      {/* Hero */}
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>Set Out for El Dorado</h1>
        <p className={styles.heroCopy}>A card game from south western Michigan.</p>
        <HeroCtas />
      </section>

      <div className={styles.modesGrid}>
        <ModeCard
          icon={<Compass size={24} aria-hidden="true" />}
          title="Single Player"
          description="Play solo against adaptive AI. Practice strategies and unlock achievements."
          ariaLabel="Start single player mode — play solo vs AI."
          primary={singlePrimaryAction}
          secondary={singleSecondaryAction ?? undefined}
          primaryEvent="landing.single.primary"
        />
        <ModeCard
          icon={<Flame size={24} aria-hidden="true" />}
          title="Multiplayer"
          description="Host a room or join with a code. Cross-device, real-time play."
          ariaLabel="Open multiplayer — host a room or join by code."
          primary={{
            label: 'Host',
            ariaLabel: 'Host Game (coming soon)',
            onClick: () => void handleHostMultiplayer('/rules'),
          }}
          secondary={{ label: 'Join by code', href: '/rules' }}
          primaryEvent="mode_multiplayer_host_clicked"
        />
        <ModeCard
          icon={<Calculator size={24} aria-hidden="true" />}
          title="Score Card"
          description="Track scores for in-person sessions. Share and export results."
          ariaLabel="Open score card for in-person tallying"
          primary={scorecardPrimaryAction}
          secondary={scorecardSecondaryAction ?? undefined}
          primaryEvent="mode_scorecard_open_clicked"
        />
      </div>

      {/* Quick Links */}
      <QuickLinks />
    </div>
  );
}
