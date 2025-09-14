import type {
  Bid,
  Card,
  PlayerId,
  RoundConfig,
  RoundResult,
  Suit,
  Trick,
  TrickPlay,
} from './types';
import { dealRound, rotateOrder, startIdxAfterDealer } from './deal';
import { trickHasTrump, ledSuitOf, winnerOfTrick } from './trick';
import { isLegalPlay } from './rules';

export function seatingOrderForBidding(cfg: RoundConfig): PlayerId[] {
  const startIdx = startIdxAfterDealer(cfg.players, cfg.dealer);
  return rotateOrder(cfg.players, startIdx);
}

export function tallyTricks(tricks: Trick[]): Record<PlayerId, number> {
  const out: Record<PlayerId, number> = {};
  for (const t of tricks) {
    if (!t.winner) continue;
    out[t.winner] = (out[t.winner] ?? 0) + 1;
  }
  return out;
}

export function madeFromBids(
  bids: Record<PlayerId, number>,
  won: Record<PlayerId, number>,
): Record<PlayerId, boolean> {
  const out: Record<PlayerId, boolean> = {};
  for (const pid of Object.keys(bids)) out[pid] = (won[pid] ?? 0) === (bids[pid] ?? 0);
  return out;
}

export type RoundStart = ReturnType<typeof dealRound> & { order: PlayerId[] };

export function startRound(cfg: RoundConfig, seed?: number): RoundStart {
  const deal = dealRound(cfg, seed);
  const order = seatingOrderForBidding(cfg);
  return { ...deal, order };
}

export function validatePlay(
  play: TrickPlay,
  playsSoFar: ReadonlyArray<TrickPlay>,
  trump: Suit,
  hand: readonly Card[],
): true | { reason: string } {
  const led = ledSuitOf(playsSoFar);
  const legal = isLegalPlay(play.card, {
    trump,
    trickHasTrump: trickHasTrump(playsSoFar, trump),
    hand,
    ...(led ? { ledSuit: led } : {}),
  });
  if (!legal) return { reason: 'Illegal play per rules' };
  return true;
}

export function resolveTrick(plays: ReadonlyArray<TrickPlay>, trump: Suit): Trick {
  // winner determined; attach winner and return Trick
  const winner = winnerOfTrick(plays, trump);
  return { ledBy: plays[0]!.player, plays: [...plays], ...(winner ? { winner } : {}) };
}

export function summarizeRound(bids: Bid[], tricks: Trick[]): RoundResult {
  const bidsMap: Record<PlayerId, number> = {};
  for (const b of bids) bidsMap[b.player] = b.amount;
  const won = tallyTricks(tricks);
  const made = madeFromBids(bidsMap, won);
  return { bids: bidsMap, tricksWon: won, made };
}
