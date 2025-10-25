'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Button, Card, Skeleton, BackLink } from '@/components/ui';
import { GamesTable } from '@/components/games';
import { Loader2 } from 'lucide-react';
import {
  type GameRecord,
  listGames,
  deriveGameMode,
  isGameRecordCompleted,
  resolveGamePlayerCount,
} from '@/lib/state';
import { useNewGameRequest, hasScorecardProgress, hasSinglePlayerProgress } from '@/lib/game-flow';
import { useAppState } from '@/components/state-provider';
import { captureBrowserMessage } from '@/lib/observability/browser';
import {
  resolveSinglePlayerRoute,
  resolveScorecardRoute,
  resolveArchivedGameRoute,
  resolveGameModalRoute,
} from '@/lib/state';
import { subscribeToGamesSignal } from '@/lib/state/game-signals';
import { trackGamesListView } from '@/lib/observability/events';

import styles from './page.module.scss';

export default function GamesPage() {
  const [games, setGames] = React.useState<GameRecord[] | null>(null);
  const router = useRouter();
  const { state } = useAppState();
  const resumeContext = React.useMemo(() => {
    if (hasSinglePlayerProgress(state)) {
      return {
        route: resolveSinglePlayerRoute(state, { fallback: 'entry' }),
        mode: 'single-player' as const,
      };
    }
    if (hasScorecardProgress(state)) {
      return {
        route: resolveScorecardRoute(state),
        mode: 'scorecard' as const,
      };
    }
    return null;
  }, [state]);
  const resumeRoute = resumeContext?.route ?? null;
  const resumeRouteRef = React.useRef<string | null>(resumeRoute);
  resumeRouteRef.current = resumeRoute;
  const handleResumeCurrentGame = React.useCallback(() => {
    const target = resumeRouteRef.current;
    if (!target) return;
    resumeRouteRef.current = null;
    router.push(target);
  }, [router]);
  const handleOpenScorecard = React.useCallback(() => {
    router.push('/games/scorecards');
  }, [router]);
  const startModeRef = React.useRef<'single-player' | 'scorecard' | null>(null);
  const { startNewGame, pending: startPending } = useNewGameRequest({
    onSuccess: () => {
      const mode = startModeRef.current;
      startModeRef.current = null;
      if (mode === 'single-player') {
        router.push('/single-player/new');
      } else if (mode === 'scorecard') {
        router.push('/scorecard/new');
      } else {
        router.push('/');
      }
    },
    onCancelled: () => {
      startModeRef.current = null;
      handleResumeCurrentGame();
    },
    analytics: { source: 'games' },
  });

  const describeError = React.useCallback((error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
  }, []);

  const load = React.useCallback(async () => {
    try {
      const list = await listGames();
      const archivedGames = [...list].sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
      setGames(archivedGames);
    } catch (error: unknown) {
      captureBrowserMessage('games.load.failed', {
        level: 'warn',
        attributes: {
          reason: describeError(error),
        },
      });
      setGames([]);
    }
  }, [describeError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    trackGamesListView({ source: 'games.page' });
  }, []);

  React.useEffect(() => {
    return subscribeToGamesSignal((signal) => {
      if (signal.type === 'added' || signal.type === 'deleted') {
        void load();
      }
    });
  }, [load]);

  const onNewGame = async () => {
    resumeRouteRef.current = resumeRoute;
    startModeRef.current = 'single-player';
    const ok = await startNewGame({
      analytics: {
        mode: 'single-player',
        source: 'games.new-game',
      },
    });
    if (!ok) {
      startModeRef.current = null;
      handleResumeCurrentGame();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h1 className={styles.title}>Games</h1>
            <p className={styles.description}>
              View and manage completed games, restore in-progress games, or start new games.
            </p>
          </div>
          <Button
            onClick={() => void onNewGame()}
            disabled={startPending}
            className={styles.newGameButton}
          >
            {startPending ? (
              <>
                <Loader2 className={styles.loaderIcon} aria-hidden="true" />
                Starting…
              </>
            ) : (
              'New Game'
            )}
          </Button>
        </div>
        <section className={styles.scorecardSection} aria-label="Scorecard overview">
          <div className={styles.scorecardCopy}>
            <h2 className={styles.scorecardTitle}>Playing in person?</h2>
            <p className={styles.scorecardDescription}>
              Track bids, tricks, and totals for a game with real people. Jump into the live
              scorecard to manage the current game or start recording a new one.
            </p>
          </div>
          <Button variant="outline" onClick={handleOpenScorecard}>
            View Scorecards
          </Button>
        </section>
        <GamesTable games={games} loading={games === null} onGamesChange={load} />
        <BackLink href="/games/scorecards">View Scorecard Games</BackLink>
        <BackLink href="/games/archived">View Archived Games</BackLink>
      </div>
    </div>
  );
}
