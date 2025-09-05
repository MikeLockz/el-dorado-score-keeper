import type { Card, PlayerId, Suit } from '../types';
import { trickHasTrump, ledSuitOf } from '../trick';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

export type BotContext = Readonly<{
  trump: Suit;
  trickPlays: ReadonlyArray<{ player: PlayerId; card: Card; order: number }>;
  hand: readonly Card[];
  tricksThisRound: number;
  seatIndex: number; // 0 = first to act in the round
  bidsSoFar: Readonly<Record<PlayerId, number>>;
  tricksWonSoFar: Readonly<Record<PlayerId, number>>;
  selfId: PlayerId;
  trumpBroken?: boolean;
}>;

function handStats(hand: readonly Card[], trump: Suit) {
  let trumpCount = 0;
  let trumpHigh = 0;
  let high = 0; // J or higher across all suits
  let nonTrumpCount = 0;
  for (const c of hand) {
    const isHigh = c.rank >= 11;
    if (c.suit === trump) {
      trumpCount++;
      if (isHigh) trumpHigh++;
    } else {
      nonTrumpCount++;
    }
    if (isHigh) high++;
  }
  return { trumpCount, trumpHigh, high, nonTrumpCount };
}

export function botBid(ctx: Omit<BotContext, 'trickPlays' | 'tricksWonSoFar'>, diff: BotDifficulty): number {
  const { trump, hand, tricksThisRound, seatIndex } = ctx;
  const s = handStats(hand, trump);
  // Heuristic base: value trump more, high cards moderate value
  let est = s.trumpHigh + 0.6 * (s.trumpCount - s.trumpHigh) + 0.35 * (s.high - s.trumpHigh);
  // Position adjustment: earlier seats bid slightly lower to avoid overcommitting
  est -= Math.max(0, 0.15 * seatIndex);
  // Difficulty noise
  const rand = Math.random() - 0.5;
  if (diff === 'easy') est += rand * 0.8 - 0.4;
  else if (diff === 'normal') est += rand * 0.4;
  else est += rand * 0.2 + 0.1; // hard slightly optimistic
  // Clamp 0..tricks
  const bid = Math.max(0, Math.min(tricksThisRound, Math.round(est)));
  return bid;
}

export function botPlay(ctx: BotContext, diff: BotDifficulty): Card {
  const { hand, trump, trickPlays, trumpBroken } = ctx;
  const led = ledSuitOf(trickPlays as any);
  const hasTrump = hand.some((c) => c.suit === trump);
  const hasNonTrump = hand.some((c) => c.suit !== trump);
  const trickTrumped = trickHasTrump(trickPlays as any, trump);

  // Utilities
  const byRankAsc = (a: Card, b: Card) => a.rank - b.rank;
  const byRankDesc = (a: Card, b: Card) => b.rank - a.rank;
  const lowest = (cards: Card[]) => cards.slice().sort(byRankAsc)[0]!;
  const highest = (cards: Card[]) => cards.slice().sort(byRankDesc)[0]!;

  // Leading
  if (!led) {
    // If trump not yet broken, avoid leading trump when we still have non-trump
    if (!trumpBroken && hasNonTrump) {
      const nonTrump = hand.filter((c) => c.suit !== trump);
      return highest(nonTrump);
    }
    if (hasNonTrump) {
      const nonTrump = hand.filter((c) => c.suit !== trump);
      // With trump broken we may still prefer a strong non-trump
      return diff === 'easy' ? lowest(nonTrump) : highest(nonTrump);
    }
    // All trump: lead lowest trump to conserve winners
    const tr = hand.filter((c) => c.suit === trump);
    return lowest(tr);
  }

  // Following
  const canFollow = hand.some((c) => c.suit === led);
  if (canFollow) {
    const follow = hand.filter((c) => c.suit === led);
    // Simple strategy: on normal/hard, try to win with highest; on easy, shed lowest
    if (diff === 'easy') return lowest(follow);
    return highest(follow);
  }

  // Off-suit
  if (trickTrumped && hasTrump) {
    // Must play a trump; play lowest trump
    const tr = hand.filter((c) => c.suit === trump);
    return lowest(tr);
  }
  if (hasTrump) {
    // Choose whether to trump in; easy ducks more often
    if (diff === 'easy' && Math.random() < 0.7) {
      // Slough lowest non-trump if any, else lowest trump
      const nonTr = hand.filter((c) => c.suit !== trump);
      return nonTr.length ? lowest(nonTr) : lowest(hand.slice());
    }
    // Trump in with lowest trump
    const tr = hand.filter((c) => c.suit === trump);
    return lowest(tr);
  }
  // No trump, cannot follow: slough lowest
  return lowest(hand.slice());
}
