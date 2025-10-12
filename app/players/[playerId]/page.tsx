import type { Metadata } from 'next';

import PlayerDetailPageClient from './PlayerDetailPageClient';

export async function generateStaticParams() {
  return [];
}

type PageParams = {
  params: {
    playerId?: string;
  };
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
  const rawId = params.playerId ?? '';
  const playerId = rawId.trim();
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

export default function PlayerDetailPage({ params }: PageParams) {
  const playerId = (params.playerId ?? '').trim();
  return <PlayerDetailPageClient playerId={playerId} />;
}
