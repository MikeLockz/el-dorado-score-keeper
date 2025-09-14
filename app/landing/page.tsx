import Link from 'next/link';
import { Button, Card } from '@/components/ui';
import ModeCard from '@/components/landing/ModeCard';
import { Compass, Users, Calculator } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="px-4 py-8 max-w-5xl mx-auto space-y-8">
      {/* Hero */}
      <section className="text-center space-y-3">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Set Out for El Dorado
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Choose your path: practice solo, gather your party, or tally scores in person.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link href="/single-player" aria-label="Start Single Player">
              Start Single Player
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/rules" aria-label="Host Game (coming soon)">
              Host Game
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/" aria-label="Open Score Card">
              Open Score Card
            </Link>
          </Button>
        </div>
      </section>

      {/* Modes Grid */}
      <section aria-label="Modes" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ModeCard
          icon={<Compass className="h-5 w-5" />}
          title="Single Player"
          description="Play solo against adaptive AI. Practice strategies and unlock achievements."
          primary={{ label: 'Start', href: '/single-player', ariaLabel: 'Start Single Player' }}
          secondary={{ label: 'Continue last run', href: '/single-player' }}
          ariaLabel="Start single player mode — play solo vs AI."
        />
        <ModeCard
          icon={<Users className="h-5 w-5" />}
          title="Multiplayer"
          description="Host a room or join with a code. Cross‑device, real‑time play."
          primary={{ label: 'Host', href: '/rules', ariaLabel: 'Host Game (coming soon)' }}
          secondary={{ label: 'Join by code', href: '/rules' }}
          ariaLabel="Open multiplayer — host a room or join by code."
        />
        <ModeCard
          icon={<Calculator className="h-5 w-5" />}
          title="Score Card"
          description="Track scores for in‑person sessions. Share and export results."
          primary={{ label: 'Open', href: '/', ariaLabel: 'Open Score Card' }}
          secondary={null}
          ariaLabel="Open score card for in‑person tallying."
        />
      </section>

      {/* Quick Links (shell) */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Quick Links</h2>
        <Card className="p-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/rules" className="text-primary underline-offset-4 hover:underline">
              How To Play
            </Link>
            {/* Recents and resume will be added in Phase 2 */}
          </div>
        </Card>
      </section>
    </div>
  );
}

