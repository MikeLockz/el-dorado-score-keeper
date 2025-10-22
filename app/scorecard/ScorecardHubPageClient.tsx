'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, Loader2, Trophy, Users } from 'lucide-react';

import { useAppState } from '@/components/state-provider';
import { Button, Card, CardContent, CardFooter, Skeleton } from '@/components/ui';
import {
  resolveScorecardRoute,
  selectPlayersOrdered,
  selectNextActionableRound,
  selectIsGameComplete,
  SCORECARD_HUB_PATH,
  ROUNDS_TOTAL,
} from '@/lib/state';
import {
  listGames,
  type GameRecord,
  restoreGame,
  deriveGameMode,
  isGameRecordCompleted,
  resolveGamePlayerCount,
} from '@/lib/state/io';
import { subscribeToGamesSignal } from '@/lib/state/game-signals';
import { useNewGameRequest } from '@/lib/game-flow';
import { formatDateTime } from '@/lib/format';
import { captureBrowserMessage } from '@/lib/observability/browser';

import styles from './page.module.scss';

type ScorecardHubVariant = 'hub' | 'games';

type ScorecardHubPageClientProps = {
  variant?: ScorecardHubVariant;
};

function isScorecardGame(game: GameRecord): boolean {
  if (deriveGameMode(game) !== 'scorecard') return false;
  const spPhase = game.summary.sp?.phase;
  if (spPhase == null) return true;
  return spPhase === 'setup';
}

function formatPlayers(count: number): string {
  if (count === 0) return 'No players';
  if (count === 1) return '1 player';
  return `${count} players`;
}

function winnerLabel(game: GameRecord): string {
  const name = game.summary.winnerName;
  const score = game.summary.winnerScore;
  if (!name) return 'No winner recorded';
  return score == null ? name : `${name} (${score})`;
}

export default function ScorecardHubPageClient({ variant = 'hub' }: ScorecardHubPageClientProps) {
  const router = useRouter();
  const { state, ready, awaitHydration, hydrationEpoch } = useAppState();
  const [games, setGames] = React.useState<GameRecord[] | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const completedMap = React.useMemo<Record<string, boolean> | null>(() => {
    if (!games) return null;
    const map: Record<string, boolean> = {};
    for (const game of games) {
      map[game.id] = isGameRecordCompleted(game);
    }
    return map;
  }, [games]);

  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const loadGames = React.useCallback(async () => {
    try {
      const list = await listGames();
      const scorecardGames = list.filter(isScorecardGame);
      setGames(scorecardGames);
      setErrorMessage((prev) => (prev && prev.startsWith('Unable to load') ? null : prev));
    } catch (error) {
      console.error('Failed to load scorecard games', error);
      setGames([]);
      setErrorMessage('Unable to load scorecard games right now.');
    }
  }, []);

  React.useEffect(() => {
    void loadGames();
  }, [loadGames]);

  React.useEffect(() => {
    return subscribeToGamesSignal((signal) => {
      if (signal.type === 'added' || signal.type === 'deleted') {
        void loadGames();
      }
    });
  }, [loadGames]);

  const waitForScorecardRoute = React.useCallback(
    async (previousEpoch: number, previousActiveId?: string | null) => {
      await Promise.race([
        awaitHydration(previousEpoch),
        new Promise((resolve) => setTimeout(resolve, 750)),
      ]);
      const snapshot = stateRef.current;
      const href = resolveScorecardRoute(snapshot);
      if (href.startsWith('/scorecard/')) {
        console.info('[scorecard-hub] resolved scorecard route after hydration', {
          href,
          activeScorecardRosterId: snapshot.activeScorecardRosterId,
          previousActiveId,
          previousEpoch,
        });
        return href;
      }
      console.info('[scorecard-hub] hydration finished without scorecard route; falling back', {
        href,
        activeScorecardRosterId: snapshot.activeScorecardRosterId,
        previousActiveId,
        previousEpoch,
      });
      return SCORECARD_HUB_PATH;
    },
    [awaitHydration],
  );

  const handleResumeCurrent = React.useCallback(() => {
    const href = resolveScorecardRoute(stateRef.current);
    if (href && href !== SCORECARD_HUB_PATH) {
      console.info('[scorecard-hub] resume current scorecard', { href });
      router.push(href);
    } else {
      console.info('[scorecard-hub] resume current scorecard fallback', { href });
    }
  }, [router]);

  const { startNewGame, pending: startingNew } = useNewGameRequest({
    analytics: { source: 'scorecard.hub', mode: 'scorecard' },
    onSuccess: () => {
      console.info('[scorecard-hub] start new game succeeded, waiting for route');
      void (async () => {
        const previousActiveId = stateRef.current.activeScorecardRosterId;
        const href = await waitForScorecardRoute(hydrationEpoch, previousActiveId);
        console.info('[scorecard-hub] routing to scorecard setup', { href });
        router.push('/scorecard/new');
      })();
    },
    onCancelled: handleResumeCurrent,
  });

  const handleStartNew = React.useCallback(async () => {
    console.info('[scorecard-hub] start new scorecard clicked');
    setErrorMessage(null);
    await startNewGame();
  }, [startNewGame]);

  const isGamesVariant = variant === 'games';

  const resumeGame = React.useCallback(
    async (game: GameRecord) => {
      if (isGamesVariant) {
        console.info('[scorecard-hub] opening archived scorecard from games variant', {
          gameId: game.id,
        });
        router.push(`/games/scorecards/${game.id}`);
        return;
      }
      if (pendingId) return;
      if (completedMap?.[game.id]) {
        setErrorMessage('Completed games cannot be restored.');
        return;
      }
      setPendingId(game.id);
      setErrorMessage(null);
      try {
        console.info('[scorecard-hub] restoring scorecard game', { gameId: game.id });
        const previousActiveId = stateRef.current.activeScorecardRosterId;
        const previousEpoch = hydrationEpoch;
        await restoreGame(undefined, game.id);
        const href = await waitForScorecardRoute(previousEpoch, previousActiveId);
        router.push(href);
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        captureBrowserMessage('scorecard.hub.resume.failed', {
          level: 'warn',
          attributes: {
            gameId: game.id,
            reason,
          },
        });
        const code =
          typeof (error as { code?: unknown })?.code === 'string'
            ? ((error as { code?: string }).code as string)
            : null;
        setErrorMessage(
          code === 'restore.completed'
            ? 'Completed games cannot be restored.'
            : 'Unable to open that scorecard game. Please try again.',
        );
      } finally {
        setPendingId((prev) => (prev === game.id ? null : prev));
      }
    },
    [isGamesVariant, pendingId, router, waitForScorecardRoute, completedMap, hydrationEpoch],
  );

  const scorecardRoute = React.useMemo(() => resolveScorecardRoute(state), [state]);
  const hasActiveSession = scorecardRoute !== SCORECARD_HUB_PATH;
  const players = React.useMemo(() => selectPlayersOrdered(state), [state]);
  const playerCount = players.length;
  const nextRound = React.useMemo(() => selectNextActionableRound(state), [state]);
  const isComplete = React.useMemo(() => selectIsGameComplete(state), [state]);
  const activeStatus = isComplete
    ? 'Completed'
    : nextRound
      ? `Next round: ${nextRound} of ${ROUNDS_TOTAL}`
      : playerCount > 0
        ? 'Ready to start'
        : 'Add players to begin';

  const pageTitle = isGamesVariant ? 'Scorecard archives' : 'Scorecard hub';
  const pageDescription = isGamesVariant
    ? 'Browse archived scorecard sessions from the games library.'
    : 'Resume your current scorecard or reopen an archived game for live tracking or summaries.';
  const listSubtitle = isGamesVariant
    ? 'Open an archived scorecard to review history and summaries.'
    : 'Restore an archived scorecard to continue editing or revisit summaries.';

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{pageTitle}</h1>
          <p className={styles.description}>{pageDescription}</p>
        </div>
        <div className={styles.headerActions}>
          <Button onClick={() => void handleStartNew()} disabled={startingNew || !ready}>
            {startingNew ? (
              <>
                <Loader2 className={styles.spinner} aria-hidden="true" />
                Starting…
              </>
            ) : (
              'Start new scorecard'
            )}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/games">View all games</Link>
          </Button>
        </div>
      </header>

      {errorMessage ? (
        <div role="alert" className={styles.error}>
          {errorMessage}
        </div>
      ) : null}

      {hasActiveSession ? (
        <Card className={styles.currentCard}>
          <CardContent className={styles.currentContent}>
            <div className={styles.currentHeader}>
              <h2 className={styles.sectionTitle}>
                {isGamesVariant ? 'Active scorecard' : 'Current scorecard'}
              </h2>
              <p className={styles.sectionSubtitle}>{activeStatus}</p>
            </div>
            {playerCount > 0 ? (
              <div className={styles.currentMeta}>
                <span className={styles.metaItem}>
                  <Users aria-hidden="true" className={styles.metaIcon} />
                  {formatPlayers(playerCount)}
                </span>
              </div>
            ) : null}
          </CardContent>
          <CardFooter className={styles.currentActions}>
            <Button onClick={handleResumeCurrent} disabled={!ready}>
              Open live scorecard
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <section className={styles.currentEmpty}>
          <h2 className={styles.sectionTitle}>No active scorecard</h2>
          <p className={styles.sectionSubtitle}>
            Start a new scorecard game to track bids and scores in real time.
          </p>
        </section>
      )}

      <section className={styles.listSection} aria-label="Archived scorecard games">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Scorecard games</h2>
          <p className={styles.sectionSubtitle}>{listSubtitle}</p>
        </div>

        {games === null ? (
          <div className={styles.list}>
            {Array.from({ length: 3 }).map((_, idx) => (
              <Card key={`skeleton-${idx}`} className={styles.gameCard}>
                <CardContent className={styles.cardContent}>
                  <Skeleton className={styles.titleSkeleton} />
                  <Skeleton className={styles.metaSkeleton} />
                  <Skeleton className={styles.metaSkeleton} />
                </CardContent>
                <CardFooter className={styles.gameFooter}>
                  <Skeleton className={styles.buttonSkeleton} />
                  <Skeleton className={styles.linkSkeleton} />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className={styles.empty}>No archived scorecard games yet.</div>
        ) : (
          <div className={styles.list}>
            {games.map((game) => {
              const pending = pendingId === game.id;
              const isCompleted = completedMap?.[game.id] ?? false;
              const round =
                typeof game.summary.scorecard?.activeRound === 'number'
                  ? game.summary.scorecard?.activeRound
                  : null;
              const cardDisabled = !isGamesVariant && (pending || isCompleted);
              const summaryAriaLabel = isGamesVariant
                ? `Open archived scorecard ${game.title || game.id}`
                : `Resume ${game.title || game.id} scorecard`;
              return (
                <Card key={game.id} className={styles.gameCard}>
                  <CardContent className={styles.cardContent}>
                    <div className={styles.gameHeader}>
                      <div className={styles.gameTitle}>{game.title}</div>
                      <div className={styles.gameMeta}>
                        <span className={styles.metaItem}>
                          <CalendarDays aria-hidden="true" className={styles.metaIcon} />
                          {formatDateTime(game.finishedAt)}
                        </span>
                        <span className={styles.metaItem}>
                          <Users aria-hidden="true" className={styles.metaIcon} />
                          {formatPlayers(resolveGamePlayerCount(game))}
                        </span>
                        {round ? (
                          <span className={styles.metaItem}>
                            Round {round} of {ROUNDS_TOTAL}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div
                      className={styles.gameSummary}
                      role="button"
                      tabIndex={cardDisabled ? -1 : 0}
                      aria-label={summaryAriaLabel}
                      aria-disabled={cardDisabled ? true : undefined}
                      onClick={() => {
                        if (isGamesVariant) {
                          router.push(`/games/scorecards/${game.id}`);
                          return;
                        }
                        if (cardDisabled) return;
                        void resumeGame(game);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        if (isGamesVariant) {
                          router.push(`/games/scorecards/${game.id}`);
                          return;
                        }
                        if (cardDisabled) return;
                        void resumeGame(game);
                      }}
                    >
                      <Trophy aria-hidden="true" className={styles.metaIcon} />
                      <span>{winnerLabel(game)}</span>
                    </div>
                  </CardContent>
                  <CardFooter className={styles.gameFooter}>
                    <Button
                      onClick={() => void resumeGame(game)}
                      disabled={isGamesVariant ? false : pending || !ready || isCompleted}
                    >
                      {isGamesVariant ? (
                        'Open'
                      ) : pending ? (
                        <>
                          <Loader2 className={styles.spinner} aria-hidden="true" />
                          Restoring…
                        </>
                      ) : isCompleted ? (
                        'Completed'
                      ) : (
                        'Resume'
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
