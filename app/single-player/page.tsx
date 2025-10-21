import type { Metadata } from 'next';
import SinglePlayerApp from './_components/SinglePlayerApp';

export const metadata: Metadata = {
  title: 'Single Player',
  description: 'Loading your latest single-player session.',
};

export default function SinglePlayerRootPage() {
  return <SinglePlayerApp key="single-player-game" />;
}
