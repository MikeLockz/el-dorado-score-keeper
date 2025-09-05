export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // J=11,Q=12,K=13,A=14

export type Card = Readonly<{
  suit: Suit;
  rank: Rank;
  // When using two decks, an instance tag disambiguates identical faces.
  deckId?: 1 | 2;
}>;

export type PlayerId = string;

export type Bid = Readonly<{
  player: PlayerId;
  amount: number; // 0..tricks
}>;

export type TrickPlay = Readonly<{
  player: PlayerId;
  card: Card;
  order: number; // strictly increasing order within a trick for tie-breaks
}>;

export type Trick = Readonly<{
  ledBy: PlayerId;
  plays: TrickPlay[];
  winner?: PlayerId;
}>;

export type RoundConfig = Readonly<{
  round: number; // 1..10
  players: PlayerId[]; // seat order
  dealer: PlayerId; // current dealer
  tricks: number; // cards per player this round
  useTwoDecks: boolean; // players > 5
}>;

export type RoundResult = Readonly<{
  bids: Record<PlayerId, number>;
  tricksWon: Record<PlayerId, number>;
  made: Record<PlayerId, boolean>;
}>;

export type RNG = () => number; // [0,1)

