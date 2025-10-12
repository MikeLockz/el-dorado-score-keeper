import type { Metadata } from 'next';

import { scrubDynamicParam, staticExportParams } from '@/lib/static-export';

import SinglePlayerApp from '../_components/SinglePlayerApp';

export async function generateStaticParams() {
  return staticExportParams('gameId');
}

type RouteParams = {
  gameId?: string;
};

function makeTitle(gameId: string): string {
  if (!gameId) return 'Single Player';
  return `Single Player • ${gameId}`;
}

function makeDescription(gameId: string): string {
  if (!gameId) {
    return 'Play El Dorado in single-player mode with live scoring and history.';
  }
  return `Continue single-player game ${gameId} with live scoring, scorecard, and summary views.`;
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
      url: gameId ? `/single-player/${gameId}` : '/single-player',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function SinglePlayerGamePage({ params }: { params: Promise<RouteParams> }) {
  const { gameId: rawId = '' } = await params;
  const gameId = scrubDynamicParam(rawId) || 'single-player-game';
  return <SinglePlayerApp key={gameId} />;
}
