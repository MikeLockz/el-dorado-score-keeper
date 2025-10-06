import type { Metadata } from 'next';

import SinglePlayerApp from '../_components/SinglePlayerApp';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = {
  params: {
    gameId?: string;
  };
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

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const rawId = params.gameId ?? '';
  const gameId = rawId.trim();
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

export default function SinglePlayerGamePage({ params }: Params) {
  const gameId = (params.gameId ?? '').trim() || 'single-player-game';
  return <SinglePlayerApp key={gameId} />;
}
