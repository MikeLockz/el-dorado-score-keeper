import type { Metadata } from 'next';

import { scrubDynamicParam, staticExportParams } from '@/lib/static-export';

import SinglePlayerScorecardPageClient from './SinglePlayerScorecardPageClient';

export async function generateStaticParams() {
  return staticExportParams('gameId');
}

type RouteParams = {
  gameId?: string;
};

type PageParams = {
  params: Promise<RouteParams>;
};

function makeTitle(gameId: string): string {
  if (!gameId) return 'Single Player scorecard';
  return `Single Player scorecard • ${gameId}`;
}

function makeDescription(gameId: string): string {
  if (!gameId) {
    return 'Inspect scorecard details for your single-player session.';
  }
  return `Review scorecard details and round outcomes for single-player game ${gameId}.`;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
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
      url: gameId ? `/single-player/${gameId}/scorecard` : '/single-player',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function SinglePlayerScorecardPage({ params }: PageParams) {
  const { gameId: rawId = '' } = await params;
  const gameId = scrubDynamicParam(rawId);
  return <SinglePlayerScorecardPageClient gameId={gameId} />;
}
