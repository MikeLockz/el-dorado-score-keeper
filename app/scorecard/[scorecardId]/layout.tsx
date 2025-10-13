'use client';

import React from 'react';
import { usePathname, useParams, useRouter } from 'next/navigation';

import { useAppState } from '@/components/state-provider';
import {
  assertEntityAvailable,
  selectScorecardById,
  type ScorecardSessionSlice,
} from '@/lib/state';
import { trackScorecardView } from '@/lib/observability/events';
import { Skeleton } from '@/components/ui/skeleton';

import ScorecardMissing from './_components/ScorecardMissing';
import styles from './layout.module.scss';

function useScorecardId(): string {
  const params = useParams();
  const raw = params?.scorecardId;
  if (Array.isArray(raw)) return raw[0] ?? '';
  if (typeof raw === 'string') return raw;
  return '';
}

function formatScorecardLabel(session: ScorecardSessionSlice | null): string {
  if (!session?.id) return 'Scorecard session';
  const name = session.roster?.name?.trim();
  if (name) return name;
  return `Scorecard ${session.id.slice(0, 8).toUpperCase()}`;
}

function resolveView(pathname: string | null | undefined, scorecardId: string): 'live' | 'summary' {
  if (!pathname) return 'live';
  const base = `/scorecard/${scorecardId}`;
  if (pathname.startsWith(`${base}/summary`)) return 'summary';
  return 'live';
}

export default function ScorecardLayout({ children }: { children: React.ReactNode }) {
  const scorecardId = useScorecardId();
  const pathname = usePathname();
  const router = useRouter();
  const { state, ready, isHydrating } = useAppState();

  const activeScorecardId = React.useMemo(() => {
    const raw = state.activeScorecardRosterId;
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'scorecard-default') return null;
    return trimmed;
  }, [state.activeScorecardRosterId]);

  const slice = React.useMemo(() => selectScorecardById(state, scorecardId), [state, scorecardId]);
  const availability = React.useMemo(
    () =>
      ready
        ? assertEntityAvailable(slice, 'scorecard-session', {
            id: scorecardId,
            archived: slice?.archived ?? false,
          })
        : null,
    [ready, slice, scorecardId],
  );

  const hydratingCurrentScorecard = Boolean(
    scorecardId && scorecardId === activeScorecardId && isHydrating && !slice,
  );

  const lastTrackedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!ready) return;
    if (!availability || availability.status !== 'found') return;
    if (!scorecardId) return;
    const view = resolveView(pathname, scorecardId);
    const key = `${scorecardId}:${view}`;
    if (lastTrackedRef.current === key) return;
    lastTrackedRef.current = key;
    trackScorecardView({ scorecardId, view, source: 'scorecard.route' });
  }, [ready, availability, scorecardId, pathname]);

  React.useEffect(() => {
    console.info('[scorecard-layout] render state', {
      ready,
      scorecardId,
      activeScorecardId,
      hasSlice: Boolean(slice),
      availabilityStatus: availability?.status ?? null,
      isHydrating,
    });
  }, [ready, scorecardId, activeScorecardId, slice, availability, isHydrating]);

  React.useEffect(() => {
    if (!ready) return;
    if (!activeScorecardId) return;
    if (!scorecardId) return;
    if (hydratingCurrentScorecard) return;
    if (activeScorecardId === scorecardId) return;
    console.info('[scorecard-layout] redirecting to active scorecard id', {
      currentRouteId: scorecardId,
      activeScorecardId,
    });
    router.replace(`/scorecard/${activeScorecardId}`);
  }, [ready, scorecardId, activeScorecardId, router, hydratingCurrentScorecard]);

  if (!ready || hydratingCurrentScorecard) {
    if (hydratingCurrentScorecard) {
      console.info('[scorecard-layout] hydrating current scorecard', {
        scorecardId,
        activeScorecardId,
      });
    }
    return (
      <div className={styles.layout}>
        <section className={styles.content} aria-busy="true">
          <div className={styles.skeletonStack}>
            <Skeleton className={styles.skeletonHeader} />
            <div className={styles.skeletonGrid}>
              {Array.from({ length: 5 }).map((_, idx) => (
                <Skeleton key={`scorecard-skeleton-${idx}`} className={styles.skeletonRow} />
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (!availability || availability.status !== 'found' || availability.status === 'archived') {
    console.warn('[scorecard-layout] scorecard unavailable', {
      scorecardId,
      activeScorecardId,
      availabilityStatus: availability?.status ?? null,
    });
    return <ScorecardMissing className={styles.missing} />;
  }

  return (
    <div className={styles.layout}>
      <section className={styles.content}>{children}</section>
    </div>
  );
}
