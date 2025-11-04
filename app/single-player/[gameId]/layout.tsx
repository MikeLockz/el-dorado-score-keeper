'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { useAppState } from '@/components/state-provider';
import {
  assertEntityAvailable,
  selectSinglePlayerGame,
  type SinglePlayerGameSlice,
} from '@/lib/state';

import SinglePlayerGameMissing from './_components/SinglePlayerGameMissing';
import styles from './layout.module.scss';

function useGameId(): string {
  const params = useParams();
  const raw = params?.gameId;
  if (Array.isArray(raw)) return raw[0] ?? '';
  if (typeof raw === 'string') return raw;
  return '';
}


export default function SinglePlayerGameLayout({ children }: { children: React.ReactNode }) {
  const gameId = useGameId();
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

  if (!ready) {
    return (
      <div className={styles.loading}>
        <Loader2 className={styles.spinner} aria-hidden="true" />
        Loading single player…
      </div>
    );
  }

  if (!availability || availability.status !== 'found') {
    return <SinglePlayerGameMissing className={styles.missing ?? ''} />;
  }

  return (
    <div className={styles.layout}>
      <section className={styles.content}>{children}</section>
    </div>
  );
}
