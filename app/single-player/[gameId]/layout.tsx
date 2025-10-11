'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

import { useAppState } from '@/components/state-provider';
import {
  assertEntityAvailable,
  selectSinglePlayerGame,
  type SinglePlayerGameSlice,
} from '@/lib/state';
import { trackSinglePlayerView } from '@/lib/observability/events';

import SinglePlayerGameMissing from './_components/SinglePlayerGameMissing';
import styles from './layout.module.scss';

function useGameId(): string {
  const params = useParams();
  const raw = params?.gameId;
  if (Array.isArray(raw)) return raw[0] ?? '';
  if (typeof raw === 'string') return raw;
  return '';
}

function formatGameLabel(slice: SinglePlayerGameSlice | null): string {
  if (!slice?.id) return 'Active game';
  return `Game ${slice.id.slice(0, 8).toUpperCase()}`;
}

function resolveView(pathname: string | null | undefined, gameId: string): 'live' | 'scorecard' | 'summary' {
  if (!pathname) return 'live';
  const base = `/single-player/${gameId}`;
  if (pathname.startsWith(`${base}/summary`)) return 'summary';
  if (pathname.startsWith(`${base}/scorecard`)) return 'scorecard';
  if (pathname === base || pathname.startsWith(`${base}?`)) return 'live';
  return 'live';
}

export default function SinglePlayerGameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gameId = useGameId();
  const pathname = usePathname();
  const { state, ready } = useAppState();
  const gameSlice = React.useMemo(() => selectSinglePlayerGame(state, gameId), [state, gameId]);
  const availability = React.useMemo(
    () =>
      ready
        ? assertEntityAvailable(gameSlice, 'single-player-game', {
            id: gameId,
          })
        : null,
    [ready, gameSlice, gameId],
  );

  const navItems = React.useMemo(() => {
    const base = `/single-player/${gameId}`;
    return [
      { href: base, label: 'Live play' },
      { href: `${base}/scorecard`, label: 'Scorecard' },
      { href: `${base}/summary`, label: 'Summary' },
    ];
  }, [gameId]);

  const lastTrackedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!ready) return;
    if (!availability || availability.status !== 'found') return;
    if (!gameId) return;
    const view = resolveView(pathname, gameId);
    const key = `${gameId}:${view}`;
    if (lastTrackedRef.current === key) return;
    lastTrackedRef.current = key;
    trackSinglePlayerView({ gameId, view, source: 'single-player.route' });
  }, [ready, availability, gameId, pathname]);

  if (!ready) {
    return (
      <div className={styles.loading}>
        <Loader2 className={styles.spinner} aria-hidden="true" />
        Loading single player…
      </div>
    );
  }

  if (!availability || availability.status !== 'found') {
    return <SinglePlayerGameMissing className={styles.missing} />;
  }

  return (
    <div className={styles.layout}>
      <section className={styles.content}>{children}</section>
    </div>
  );
}
