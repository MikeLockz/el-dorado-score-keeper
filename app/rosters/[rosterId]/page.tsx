import type { Metadata } from 'next';

import { scrubDynamicParam, staticExportParams } from '@/lib/static-export';

import RosterDetailPageClient from './RosterDetailPageClient';

export async function generateStaticParams() {
  return staticExportParams('rosterId');
}

type RouteParams = {
  rosterId?: string;
};

type PageParams = {
  params: Promise<RouteParams>;
};

function formatRosterTitle(rosterId: string): string {
  if (!rosterId) return 'Roster';
  return `Roster • ${rosterId}`;
}

function formatRosterDescription(rosterId: string): string {
  if (!rosterId) {
    return 'View roster details, including player assignments and archival status.';
  }
  return `Inspect roster ${rosterId} and share a deep link with your team.`;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { rosterId: rawId = '' } = await params;
  const rosterId = scrubDynamicParam(rawId);
  const title = formatRosterTitle(rosterId);
  const description = formatRosterDescription(rosterId);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: rosterId ? `/rosters/${rosterId}` : '/rosters',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function RosterDetailPage({ params }: PageParams) {
  const { rosterId: rawId = '' } = await params;
  const rosterId = scrubDynamicParam(rawId);
  return <RosterDetailPageClient rosterId={rosterId} />;
}
