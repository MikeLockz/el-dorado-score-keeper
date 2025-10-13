'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

import { useAppState } from '@/components/state-provider';
import {
  assertEntityAvailable,
  selectScorecardById,
  type ScorecardSessionSlice,
} from '@/lib/state';
import { trackScorecardView } from '@/lib/observability/events';

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
  const { state, ready } = useAppState();

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

  const navItems = React.useMemo(() => {
    const base = `/scorecard/${scorecardId}`;
    return [
      { href: base, label: 'Live scorecard' },
      { href: `${base}/summary`, label: 'Summary' },
    ];
  }, [scorecardId]);

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

  if (!ready) {
    return (
      <div className={styles.loading}>
        <Loader2 className={styles.spinner} aria-hidden="true" />
        Loading scorecard…
      </div>
    );
  }

  if (!availability || availability.status !== 'found' || availability.status === 'archived') {
    return <ScorecardMissing className={styles.missing} />;
  }

  return (
    <div className={styles.layout}>
      <section className={styles.content}>{children}</section>
    </div>
  );
}
