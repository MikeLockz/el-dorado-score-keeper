import type { Metadata } from 'next';

import { scrubDynamicParam, staticExportParams } from '@/lib/static-export';

import GameDetailPageClient from '../../[gameId]/GameDetailPageClient';

export async function generateStaticParams() {
  return staticExportParams('gameId');
}

type RouteParams = {
  gameId?: string;
};

function makeTitle(gameId: string): string {
  if (!gameId) return 'Scorecard archive';
  return `Scorecard archive • ${gameId}`;
}

function makeDescription(gameId: string): string {
  if (!gameId) {
    return 'Review archived scorecard analytics, round history, and share deep links.';
  }
  return `Inspect archived scorecard ${gameId}, including score history and recovery actions.`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { gameId: rawId = '' } = await params;
  const gameId = scrubDynamicParam(rawId);
  const title = makeTitle(gameId);
  const description = makeDescription(gameId);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: gameId ? `/games/scorecards/${gameId}` : '/games/scorecards',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function GamesScorecardDetailPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { gameId: rawId = '' } = await params;
  const gameId = scrubDynamicParam(rawId);
  return <GameDetailPageClient gameId={gameId} />;
}
