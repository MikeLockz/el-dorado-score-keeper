import type { Metadata } from 'next';

import { scrubDynamicParam, staticExportParams } from '@/lib/static-export';

import PlayerStatisticsPageClient from './PlayerStatisticsPageClient';

export async function generateStaticParams() {
  return staticExportParams('playerId');
}

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
  const playerId = scrubDynamicParam(resolved.playerId);
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
  const playerId = scrubDynamicParam(resolved.playerId);
  return <PlayerStatisticsPageClient playerId={playerId} />;
}
