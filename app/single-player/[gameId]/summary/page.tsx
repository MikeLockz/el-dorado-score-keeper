import type { Metadata } from 'next';

import { scrubDynamicParam, staticExportParams } from '@/lib/static-export';

import SinglePlayerSummaryPageClient from './SinglePlayerSummaryPageClient';

export async function generateStaticParams() {
  return staticExportParams('gameId');
}

type PageParams = {
  params: {
    gameId?: string;
  };
};

function makeTitle(gameId: string): string {
  if (!gameId) return 'Single Player summary';
  return `Single Player summary • ${gameId}`;
}

function makeDescription(gameId: string): string {
  if (!gameId) {
    return 'View Single Player results with totals, round breakdowns, and shareable links.';
  }
  return `Review the summary for single-player game ${gameId}, including shareable history and totals.`;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const gameId = scrubDynamicParam(params.gameId);
  const title = makeTitle(gameId);
  const description = makeDescription(gameId);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: gameId ? `/single-player/${gameId}/summary` : '/single-player',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default function SinglePlayerSummaryPage({ params }: PageParams) {
  const gameId = scrubDynamicParam(params.gameId);
  return <SinglePlayerSummaryPageClient gameId={gameId} />;
}
