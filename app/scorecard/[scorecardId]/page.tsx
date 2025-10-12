import type { Metadata } from 'next';

import { scrubDynamicParam, staticExportParams } from '@/lib/static-export';
import CurrentGame from '@/components/views/CurrentGame';

import styles from './page.module.scss';

export async function generateStaticParams() {
  return staticExportParams('scorecardId');
}

type Params = {
  params: {
    scorecardId?: string;
  };
};

function makeTitle(scorecardId: string): string {
  if (!scorecardId) return 'Scorecard';
  return `Scorecard • ${scorecardId}`;
}

function makeDescription(scorecardId: string): string {
  if (!scorecardId) {
    return 'Track live scores and bids with a shareable scorecard session.';
  }
  return `Live score tracking for scorecard session ${scorecardId} with editable bids and history.`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const scorecardId = scrubDynamicParam(params.scorecardId);
  const title = makeTitle(scorecardId);
  const description = makeDescription(scorecardId);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: scorecardId ? `/scorecard/${scorecardId}` : '/scorecard',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default function ScorecardSessionPage({ params }: Params) {
  const scorecardId = scrubDynamicParam(params.scorecardId) || 'scorecard-session';
  return (
    <div className={styles.container}>
      <CurrentGame key={scorecardId} />
    </div>
  );
}
