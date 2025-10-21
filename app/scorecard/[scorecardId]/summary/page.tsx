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

type MetadataParams = {
  params: Promise<RouteParams> | RouteParams;
};

type PageParams = {
  params?: RouteParams;
};

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return !!value && typeof (value as { then?: unknown }).then === 'function';
}

async function resolveParams(
  params: Promise<RouteParams> | RouteParams | undefined,
): Promise<RouteParams> {
  if (!params) return {};
  if (isPromiseLike<RouteParams>(params)) {
    return params;
  }
  return params;
}

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

export async function generateMetadata({ params }: MetadataParams): Promise<Metadata> {
  const { scorecardId: rawId = '' } = await resolveParams(params);
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

export default function ScorecardSummaryPage({ params }: PageParams = {}) {
  const { scorecardId: rawId = '' } = params ?? {};
  const scorecardId = scrubDynamicParam(rawId);
  if (scorecardId === 'scorecard-default') {
    redirect(SCORECARD_HUB_PATH);
  }
  return <ScorecardSummaryPageClient scorecardId={scorecardId || undefined} />;
}
