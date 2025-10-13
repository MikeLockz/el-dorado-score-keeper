import type { Metadata } from 'next';

import SinglePlayerNewPageClient from './SinglePlayerNewPageClient';

export const metadata: Metadata = {
  title: 'Single-player setup',
  description: 'Pick a saved roster or generate bots before starting a new single-player run.',
};

export default function SinglePlayerNewPage() {
  return <SinglePlayerNewPageClient />;
}
