import type { Metadata } from 'next';

import { scrubDynamicParam, staticExportParams } from '@/lib/static-export';

import PlayerDetailPageClient from './PlayerDetailPageClient';

export async function generateStaticParams() {
  return staticExportParams('playerId');
}

type RouteParams = {
  playerId?: string;
};

type PageParams = {
  params: Promise<RouteParams>;
};

function formatPlayerTitle(playerId: string): string {
  if (!playerId) return 'Player';
  return `Player • ${playerId}`;
}

function formatPlayerDescription(playerId: string): string {
  if (!playerId) {
    return 'View details for a player, including archival status and management links.';
  }
  return `Review the profile for player ${playerId}. Deep links keep roster management in sync.`;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { playerId: rawId = '' } = await params;
  const playerId = scrubDynamicParam(rawId);
  const title = formatPlayerTitle(playerId);
  const description = formatPlayerDescription(playerId);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: playerId ? `/players/${playerId}` : '/players',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function PlayerDetailPage({ params }: PageParams) {
  const { playerId: rawId = '' } = await params;
  const playerId = scrubDynamicParam(rawId);
  return <PlayerDetailPageClient playerId={playerId} />;
}
