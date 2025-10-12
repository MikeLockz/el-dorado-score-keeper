import type { Metadata } from 'next';

import GameDetailPageClient from './GameDetailPageClient';

export async function generateStaticParams() {
  return [];
}

type PageParams = {
  params: {
    gameId?: string;
  };
};

function makeTitle(gameId: string): string {
  if (!gameId) return 'Archived game';
  return `Archived game • ${gameId}`;
}

function makeDescription(gameId: string): string {
  if (!gameId) {
    return 'Review archived game analytics, round history, and share deep links.';
  }
  return `Inspect archived game ${gameId}, including score history and recovery actions.`;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
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
      url: gameId ? `/games/${gameId}` : '/games',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default function GameDetailPage({ params }: PageParams) {
  const gameId = (params.gameId ?? '').trim();
  return <GameDetailPageClient gameId={gameId} />;
}
