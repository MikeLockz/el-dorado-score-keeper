import type { Metadata } from 'next';

import PlayerStatisticsPageClient from './PlayerStatisticsPageClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PageParams = {
  params: {
    playerId?: string;
  };
};

function makeTitle(playerId: string): string {
  if (!playerId) return 'Player statistics';
  return `Player statistics • ${playerId}`;
}

function makeDescription(playerId: string): string {
  if (!playerId) {
    return 'Review historical performance for a player using aggregated bids, rounds, and streaks.';
  }
  return `Explore historical performance insights for player ${playerId}.`;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const rawId = params.playerId ?? '';
  const playerId = rawId.trim();
  const title = makeTitle(playerId);
  const description = makeDescription(playerId);
  const path = playerId ? `/players/${playerId}/statistics` : '/players';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: path,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default function PlayerStatisticsPage({ params }: PageParams) {
  const playerId = (params.playerId ?? '').trim();
  return <PlayerStatisticsPageClient playerId={playerId} />;
}
