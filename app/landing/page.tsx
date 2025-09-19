// no-op
import * as React from 'react';
import { useRouter } from 'next/navigation';
import ModeCard from '@/components/landing/ModeCard';
import { Compass, Flame, Calculator } from 'lucide-react';
import QuickLinks from '@/components/landing/QuickLinks';
import HeroCtas from '@/components/landing/HeroCtas';
import { useAppState } from '@/components/state-provider';
import { useNewGameRequest, hasScorecardProgress, hasSinglePlayerProgress } from '@/lib/game-flow';

export default function LandingPage() {
  const router = useRouter();
  const { state } = useAppState();
  const { startNewGame, pending: newGamePending } = useNewGameRequest();

  const singlePlayerActive = hasSinglePlayerProgress(state);
  const scorecardActive = hasScorecardProgress(state);

  const handleStartNew = React.useCallback(
    async (mode: 'single' | 'scorecard') => {
      if (newGamePending) return;
      const ok = await startNewGame();
      if (ok) {
        router.push(mode === 'single' ? '/single-player' : '/scorecard');
      }
    },
    [newGamePending, router, startNewGame],
  );

  return (
    <div className="px-4 py-16 sm:py-24 max-w-5xl mx-auto space-y-10">
      {/* Hero */}
      <section className="text-center space-y-3">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Set Out for El Dorado</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Choose your path: practice solo, gather your party, or tally scores on the go.
        </p>
        <HeroCtas />
      </section>

      {/* Modes Grid */}
      <section aria-label="Modes" className="grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <ModeCard
          icon={<Compass className="h-5 w-5" />}
          title="Single Player"
          description="Play solo against adaptive AI. Practice strategies and unlock achievements."
          primary={
            singlePlayerActive
              ? {
                  label: 'Resume Game',
                  href: '/single-player',
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
          icon={<Flame className="h-5 w-5" />}
          title="Multiplayer"
          description="Host a room or join with a code. Cross‑device, real‑time play."
          primary={{ label: 'Host', href: '/rules', ariaLabel: 'Host Game (coming soon)' }}
          primaryEvent="mode_multiplayer_host_clicked"
          secondary={{ label: 'Join by code', href: '/rules' }}
          ariaLabel="Open multiplayer — host a room or join by code."
        />
        <ModeCard
          icon={<Calculator className="h-5 w-5" />}
          title="Score Card"
          description="Track scores for in‑person sessions. Share and export results."
          primary={
            scorecardActive
              ? {
                  label: 'Resume Score Card',
                  href: '/scorecard',
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
