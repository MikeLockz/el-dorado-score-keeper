'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';
import { logEvent } from '@/lib/client-log';

export default function HeroCtas() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
      <Button asChild>
        <Link
          href="/single-player"
          aria-label="Start Single Player"
          onClick={() => logEvent('hero_start_single_clicked')}
        >
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
  );
}

