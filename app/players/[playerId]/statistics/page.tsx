import type { Metadata } from 'next';

import PlayerStatisticsPageClient from './PlayerStatisticsPageClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteParams = {
  playerId?: string;
};

type PageParams = {
  params: Promise<RouteParams> | RouteParams;
};

async function resolveParams(input: PageParams['params']): Promise<RouteParams> {
  return typeof (input as Promise<RouteParams>)?.then === 'function'
    ? ((await input) as RouteParams)
    : ((input as RouteParams) ?? {});
}

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
  const resolved = await resolveParams(params);
  const rawId = resolved.playerId ?? '';
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

export default async function PlayerStatisticsPage({ params }: PageParams) {
  const resolved = await resolveParams(params);
  const playerId = (resolved.playerId ?? '').trim();
  return <PlayerStatisticsPageClient playerId={playerId} />;
}
