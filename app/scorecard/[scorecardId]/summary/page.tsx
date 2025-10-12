import type { Metadata } from 'next';

import ScorecardSummaryPageClient from './ScorecardSummaryPageClient';

export async function generateStaticParams() {
  return [];
}

type PageParams = {
  params: {
    scorecardId?: string;
  };
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
  const rawId = params.scorecardId ?? '';
  const scorecardId = rawId.trim();
  const title = makeTitle(scorecardId);
  const description = makeDescription(scorecardId);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: scorecardId ? `/scorecard/${scorecardId}/summary` : '/scorecard',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default function ScorecardSummaryPage({ params }: PageParams) {
  const scorecardId = (params.scorecardId ?? '').trim();
  return <ScorecardSummaryPageClient scorecardId={scorecardId} />;
}
