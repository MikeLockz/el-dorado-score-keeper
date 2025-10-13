import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { scrubDynamicParam, staticExportParams } from '@/lib/static-export';
import { SCORECARD_HUB_PATH } from '@/lib/state';

import ScorecardSummaryPageClient from './ScorecardSummaryPageClient';

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
  if (!scorecardId) return 'Scorecard summary';
  return `Scorecard summary • ${scorecardId}`;
}

function makeDescription(scorecardId: string): string {
  if (!scorecardId) {
    return 'Share summary results for a scorecard session, including print-friendly totals.';
  }
  return `Download or share the summary for scorecard session ${scorecardId}.`;
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
      url: scorecardId ? `/scorecard/${scorecardId}/summary` : SCORECARD_HUB_PATH,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function ScorecardSummaryPage({ params }: PageParams) {
  const { scorecardId: rawId = '' } = await params;
  const scorecardId = scrubDynamicParam(rawId);
  if (scorecardId === 'scorecard-default') {
    redirect(SCORECARD_HUB_PATH);
  }
  const resolvedId = scorecardId || 'scorecard-session';
  return <ScorecardSummaryPageClient scorecardId={resolvedId} />;
}
