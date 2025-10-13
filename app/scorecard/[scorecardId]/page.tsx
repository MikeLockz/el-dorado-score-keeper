import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { scrubDynamicParam, staticExportParams } from '@/lib/static-export';
import { SCORECARD_HUB_PATH } from '@/lib/state';
import CurrentGame from '@/components/views/CurrentGame';

import styles from './page.module.scss';

export async function generateStaticParams() {
  return staticExportParams('scorecardId');
}

type RouteParams = {
  scorecardId?: string;
};

type PageParams = {
  params: Promise<RouteParams>;
};

function makeTitle(scorecardId: string): string {
  if (!scorecardId) return 'Scorecard';
  return `Scorecard • ${scorecardId}`;
}

function makeDescription(scorecardId: string): string {
  if (!scorecardId) {
    return 'Track live scores and bids with a shareable scorecard session.';
  }
  return `Live score tracking for scorecard session ${scorecardId} with editable bids and history.`;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { scorecardId: rawId = '' } = await params;
  const scorecardId = scrubDynamicParam(rawId);
  const title = makeTitle(scorecardId);
  const description = makeDescription(scorecardId);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: scorecardId ? `/scorecard/${scorecardId}` : SCORECARD_HUB_PATH,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function ScorecardSessionPage({ params }: PageParams) {
  const { scorecardId: rawId = '' } = await params;
  const scorecardId = scrubDynamicParam(rawId);
  if (scorecardId === 'scorecard-default') {
    redirect(SCORECARD_HUB_PATH);
  }
  const resolvedId = scorecardId || 'scorecard-session';
  return (
    <div className={styles.container}>
      <CurrentGame key={resolvedId} />
    </div>
  );
}
