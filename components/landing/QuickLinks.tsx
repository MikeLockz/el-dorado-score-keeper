'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@/components/ui';
import { useAppState } from '@/components/state-provider';
import {
  listGames,
  type GameRecord,
  restoreGame,
  deriveGameMode,
  isGameRecordCompleted,
  resolveGamePlayerCount,
} from '@/lib/state/io';
import { formatDateTime } from '@/lib/format';
import { Loader2 } from 'lucide-react';
import { captureBrowserMessage } from '@/lib/observability/browser';
import { resolveSinglePlayerRoute, resolveScorecardRoute, SCORECARD_HUB_PATH } from '@/lib/state';

import styles from './quick-links.module.scss';

export default function QuickLinks() {
  const { ready, height, state, awaitHydration, hydrationEpoch } = useAppState();
  const [recents, setRecents] = React.useState<GameRecord[] | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const router = useRouter();
  const stateRef = React.useRef(state);

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  React.useEffect(() => {
    let closed = false;
    void (async () => {
      try {
        const all = await listGames();
        if (!closed) setRecents(all.slice(0, 3));
      } catch {
        if (!closed) setRecents([]);
      }
    })();
    return () => {
      closed = true;
    };
  }, []);

  const resumeLink = React.useMemo(() => {
    const singleRoute = resolveSinglePlayerRoute(state, { fallback: 'entry' });
    if (singleRoute.startsWith('/single-player/') && singleRoute.split('/').length >= 3) {
      return { href: singleRoute, mode: 'single-player' as const };
    }
    const scorecardRoute = resolveScorecardRoute(state);
    if (scorecardRoute.startsWith('/scorecard/') && scorecardRoute !== SCORECARD_HUB_PATH) {
      return { href: scorecardRoute, mode: 'scorecard' as const };
    }
    return null;
  }, [state]);

  const showResume = ready && height > 0 && !!resumeLink;

  const waitForRestoredRoute = React.useCallback(
    async (mode: 'single-player' | 'scorecard', previousEpoch: number): Promise<string> => {
      await Promise.race([
        awaitHydration(previousEpoch),
        new Promise((resolve) => setTimeout(resolve, 750)),
      ]);
      const snapshot = stateRef.current;
      const candidate =
        mode === 'single-player'
          ? resolveSinglePlayerRoute(snapshot, { fallback: 'entry' })
          : resolveScorecardRoute(snapshot);
      if (mode === 'single-player') {
        return candidate.startsWith('/single-player/') && candidate.split('/').length >= 3
          ? candidate
          : '/single-player';
      }
      return candidate.startsWith('/scorecard/') ? candidate : SCORECARD_HUB_PATH;
    },
    [awaitHydration],
  );

  const resumeGame = React.useCallback(
    async (game: GameRecord) => {
      if (pendingId) return;
      if (isGameRecordCompleted(game)) return;
      setPendingId(game.id);
      try {
        const previousEpoch = hydrationEpoch;
        await restoreGame(undefined, game.id);
        const mode = deriveGameMode(game);
        const route = await waitForRestoredRoute(mode, previousEpoch);
        router.push(route);
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        captureBrowserMessage('quick-links.resume.failed', {
          level: 'warn',
          attributes: {
            gameId: game.id,
            reason,
            mode: deriveGameMode(game),
          },
        });
        setPendingId(null);
      } finally {
        setPendingId((prev) => (prev === game.id ? null : prev));
      }
    },
    [pendingId, router, waitForRestoredRoute, hydrationEpoch],
  );

  return (
    <section className={styles.quickLinks} aria-label="Quick Links">
      <h2 className={styles.heading}>Quick Links</h2>
      <Card className={styles.card}>
        <div className={styles.linksRow}>
          <Link href="/rules" className={styles.link}>
            How To Play
          </Link>
          {showResume && resumeLink?.href ? (
            <Button asChild size="sm" variant="outline">
              <Link href={resumeLink.href} aria-label="Resume current game">
                Resume current game
              </Link>
            </Button>
          ) : null}
        </div>
        <div className={styles.recentsContainer}>
          {recents === null ? (
            <div className={styles.loading}>Loading recent sessions…</div>
          ) : recents.length > 0 ? (
            <div className={styles.recentsList}>
              {recents.map((game) => {
                const mode = deriveGameMode(game);
                const handLabel = deriveHandLabel(game, mode);
                const playersLabel = derivePlayersLabel(resolveGamePlayerCount(game));
                const lastPlayed = formatDateTime(game.finishedAt);
                const pending = pendingId === game.id;
                const completed = isGameRecordCompleted(game);
                return (
                  <div
                    key={game.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Resume ${modeLabel(mode)} from ${lastPlayed}`}
                    aria-disabled={pending || completed ? true : undefined}
                    onClick={() => {
                      if (pending || completed) return;
                      void resumeGame(game);
                    }}
                    onKeyDown={(event) => {
                      if (pending || completed) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void resumeGame(game);
                      }
                    }}
                    className={styles.resumeItem}
                  >
                    <div className={styles.resumeMeta}>
                      <span>{modeLabel(mode)}</span>
                      <span className={styles.resumeSeparator}>•</span>
                      <span className={styles.resumeMetaDetail}>{playersLabel}</span>
                      {handLabel ? (
                        <>
                          <span className={styles.resumeSeparator}>•</span>
                          <span className={styles.resumeMetaDetail}>{handLabel}</span>
                        </>
                      ) : null}
                    </div>
                    <div className={styles.resumeActions}>
                      <span className={styles.resumeDate}>{lastPlayed}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (pending || completed) return;
                          void resumeGame(game);
                        }}
                        disabled={pending || completed}
                      >
                        {pending ? (
                          <span className={styles.resumeButtonContent}>
                            <Loader2 className={styles.spinner} aria-hidden="true" />
                            Resume
                          </span>
                        ) : completed ? (
                          'Completed'
                        ) : (
                          'Resume'
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
              <div className={styles.recentsFooter}>
                <Link href="/games" className={styles.link}>
                  View all games
                </Link>
              </div>
            </div>
          ) : (
            <div className={styles.empty}>Your games will appear here.</div>
          )}
        </div>
      </Card>
    </section>
  );
}

function modeLabel(mode: 'single-player' | 'scorecard'): string {
  return mode === 'single-player' ? 'Single Player' : 'Score Card';
}

function deriveHandLabel(game: GameRecord, mode: 'single-player' | 'scorecard'): string | null {
  if (mode === 'single-player') {
    const round = game.summary.sp?.roundNo ?? null;
    if (round && round > 0) return `Hand ${round}`;
    return null;
  }
  const round = game.summary.scorecard?.activeRound ?? null;
  if (round && round > 0) return `Round ${round}`;
  return null;
}

function derivePlayersLabel(count: number): string {
  if (count === 1) return '1 player';
  return `${count} players`;
}
