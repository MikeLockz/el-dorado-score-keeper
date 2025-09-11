import type { Card, PlayerId, Suit } from './types';
import { bots } from './index';

export type PreBidArgs = Readonly<{
  roundNo: number;
  order: PlayerId[];
  humanId: PlayerId;
  trump: Suit;
  hands: Record<PlayerId, readonly Card[]>;
  tricks: number;
  existingBids: Readonly<Record<PlayerId, number | undefined>>;
}>;

export type PreBid = Readonly<{ playerId: PlayerId; bid: number; seatIndex: number }>;

// Determine bids for all bot players who act before the human in the bidding order.
export function computePrecedingBotBids(args: PreBidArgs): PreBid[] {
  const { order, humanId, trump, hands, tricks, existingBids } = args;
  const humanPos = order.findIndex((p) => p === humanId);
  if (humanPos <= 0) return [];
  const out: PreBid[] = [];
  for (let i = 0; i < humanPos; i++) {
    const pid = order[i]!;
    if (pid === humanId) continue;
    if (existingBids[pid] != null) continue;
    const amount = bots.botBid(
      {
        trump,
        hand: hands[pid] ?? [],
        tricksThisRound: tricks,
        seatIndex: i,
        bidsSoFar: existingBids as Record<PlayerId, number>,
        selfId: pid,
      },
      'normal',
    );
    out.push({ playerId: pid, bid: amount, seatIndex: i });
  }
  return out;
}

