import type { Metadata } from 'next';

import SinglePlayerNewPageClient from './SinglePlayerNewPageClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'New Single Player game',
  description: 'Start a fresh single-player run or resume your in-progress game.',
};

export default function SinglePlayerNewPage() {
  return <SinglePlayerNewPageClient />;
}
