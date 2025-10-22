import type { Metadata } from 'next';

import { scrubDynamicParam, staticExportParams } from '@/lib/static-export';

import PlayerStatisticsPageClient from './PlayerStatisticsPageClient';

export function generateStaticParams() {
  return staticExportParams('playerId');
}

type RouteParams = {
  playerId?: string | string[];
};

type PageParams = {
  params?: Promise<RouteParams>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ResolveInput = PageParams['params'] | RouteParams | undefined;

async function resolveParams(input: ResolveInput): Promise<RouteParams> {
  if (!input) {
    return {};
  }
  const resolved = await Promise.resolve(input);
  return resolved ?? {};
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
