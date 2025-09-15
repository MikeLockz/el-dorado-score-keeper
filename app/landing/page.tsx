// no-op
import ModeCard from '@/components/landing/ModeCard';
import { Compass, Flame, Calculator } from 'lucide-react';
import QuickLinks from '@/components/landing/QuickLinks';
import HeroCtas from '@/components/landing/HeroCtas';

export default function LandingPage() {
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
          primary={{ label: 'Start', href: '/single-player', ariaLabel: 'Start Single Player' }}
          secondary={{ label: 'Continue last run', href: '/single-player' }}
          ariaLabel="Start single player mode — play solo vs AI."
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
          primary={{ label: 'Open', href: '/scorecard', ariaLabel: 'Open Score Card' }}
          primaryEvent="mode_scorecard_open_clicked"
          secondary={null}
          ariaLabel="Open score card for in‑person tallying."
        />
      </section>

      {/* Quick Links */}
      <QuickLinks />
    </div>
  );
}
