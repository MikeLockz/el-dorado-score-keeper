import type { PlayerId, Suit, Trick, TrickPlay } from './types';
import { compareRanks } from './ordering';

export function ledSuitOf(plays: ReadonlyArray<TrickPlay>): Suit | undefined {
  return plays.length > 0 ? plays[0]!.card.suit : undefined;
}

export function trickHasTrump(plays: ReadonlyArray<TrickPlay>, trump: Suit): boolean {
  return plays.some((p) => p.card.suit === trump);
}

export function winnerOfTrick(plays: ReadonlyArray<TrickPlay>, trump: Suit): PlayerId | undefined {
  if (plays.length === 0) return undefined;
  const led = plays[0]!.card.suit;
  let best: TrickPlay = plays[0]!;
  let bestIsTrump = best.card.suit === trump;
  for (let i = 1; i < plays.length; i++) {
    const p = plays[i]!;
    const isTrump = p.card.suit === trump;
    if (bestIsTrump && isTrump) {
      // both trump: higher rank wins; earlier play wins ties implicitly by skipping when equal
      if (compareRanks(p.card.rank, best.card.rank) > 0) best = p;
    } else if (!bestIsTrump && isTrump) {
      best = p;
      bestIsTrump = true;
    } else if (!bestIsTrump && !isTrump) {
      // compare only if same as led suit
      if (p.card.suit === led && best.card.suit === led) {
        if (compareRanks(p.card.rank, best.card.rank) > 0) best = p;
      }
    }
  }
  return best.player;
}

export function closeTrick(plays: ReadonlyArray<TrickPlay>, trump: Suit): Trick {
  const ledBy = plays[0]?.player as PlayerId;
  const winner = winnerOfTrick(plays, trump);
  return { ledBy, plays: [...plays], ...(winner ? { winner } : {}) };
}
