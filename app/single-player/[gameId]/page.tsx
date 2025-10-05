import SinglePlayerApp from '../_components/SinglePlayerApp';

type Params = {
  params: {
    gameId: string;
  };
};

export default function SinglePlayerGamePage({ params }: Params) {
  return <SinglePlayerApp key={params.gameId ?? 'single-player-game'} />;
}
