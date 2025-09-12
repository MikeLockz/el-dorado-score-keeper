import type { AppState } from '@/lib/state/types';
import { events, type AppEvent } from '@/lib/state/events';
import { tricksForRound } from '@/lib/state/logic';
import {
  selectSpNextToPlay,
  selectSpTricksForRound,
  selectPlayersOrdered,
} from '@/lib/state/selectors';
import { bots, startRound, winnerOfTrick } from './index';
import { computePrecedingBotBids } from './auto-bid';
import type { Card } from './types';

// Return bid/set events for bot players who act before the human in current round order.
export function prefillPrecedingBotBids(
  state: AppState,
  roundNo: number,
  humanId: string,
  rng?: () => number,
): AppEvent[] {
  const trump = state.sp.trump;
  const order: string[] = state.sp.order ?? [];
  const hands: Record<string, readonly Card[]> = state.sp.hands ?? {};
  if (!trump || order.length === 0) return [];
  const tricks = tricksForRound(roundNo);
  const bidsSoFar = (state.rounds[roundNo]?.bids ?? {}) as Record<string, number | undefined>;
  const pre = computePrecedingBotBids({
    roundNo,
    order,
    humanId,
    trump,
    hands,
    tricks,
    existingBids: bidsSoFar,
    rng,
  });
  return pre.map((b) => events.bidSet({ round: roundNo, playerId: b.playerId, bid: b.bid }));
}

// If it is playerId's turn and they are a bot (i.e., not the human), choose a card and emit one sp/trick/played.
export function computeBotPlay(state: AppState, playerId: string, rng?: () => number): AppEvent[] {
  if (state.sp.phase !== 'playing') return [];
  if (state.sp.reveal) return [];
  const next = selectSpNextToPlay(state);
  if (!next || next !== playerId) return [];
  const trump = state.sp.trump;
  if (!trump) return [];
  const botHand: readonly Card[] = state.sp.hands?.[playerId] ?? [];
  if (!botHand || botHand.length === 0) return [];
  const trickPlays = state.sp.trickPlays.map((p, i) => ({
    player: p.playerId,
    card: p.card,
    order: i,
  }));
  const ctx = {
    trump,
    trickPlays,
    hand: botHand,
    tricksThisRound: selectSpTricksForRound(state),
    seatIndex: (state.sp.order ?? []).indexOf(playerId),
    bidsSoFar: state.rounds[state.sp.roundNo ?? 0]?.bids ?? {},
    tricksWonSoFar: state.sp.trickCounts ?? {},
    selfId: playerId,
    trumpBroken: !!state.sp.trumpBroken,
    rng,
  };
  const card = bots.botPlay(ctx, 'normal');
  return [
    events.spTrickPlayed({ playerId, card: { suit: card.suit, rank: card.rank } }),
  ];
}

// When the current trick is complete, emit clear + winner batch (and mark trump broken when appropriate).
export function resolveCompletedTrick(state: AppState): AppEvent[] {
  const phase = state.sp.phase;
  if (phase !== 'playing') return [];
  const order = state.sp.order ?? [];
  const plays = state.sp.trickPlays ?? [];
  const trump = state.sp.trump;
  if (!trump || plays.length === 0) return [];
  if (plays.length < order.length) return [];
  // Already revealing? do nothing
  if (state.sp.reveal) return [];
  const winner = winnerOfTrick(
    plays.map((p, i) => ({ player: p.playerId, card: p.card, order: i })),
    trump,
  );
  if (!winner) return [];
  const ledSuit = plays[0]?.card?.suit;
  const anyTrump = plays.some((p) => p.card?.suit === trump);
  const batch: AppEvent[] = [];
  if (!state.sp.trumpBroken && anyTrump && ledSuit && ledSuit !== trump) {
    batch.push(events.spTrumpBrokenSet({ broken: true }));
  }
  // Enter reveal state; UI will clear and advance leader on explicit user action
  batch.push(events.spTrickRevealSet({ winnerId: winner }));
  return batch;
}

export type FinalizeOptions = {
  now?: number;
  useTwoDecks?: boolean; // override; defaults to players.length > 5
};

// If the round is done and not already scored, emit scoring + (optional) next round deal batch.
export function finalizeRoundIfDone(state: AppState, opts: FinalizeOptions = {}): AppEvent[] {
  const sp = state.sp;
  const roundNo = sp.roundNo ?? 0;
  if (roundNo <= 0) return [];
  // Already scored? do nothing
  if ((state.rounds[roundNo]?.state ?? 'locked') === 'scored') return [];
  // Gate finalization until after the last clear: if reveal is active, keep the hand visible
  if (sp.reveal) return [];
  // Check done condition
  const needed = selectSpTricksForRound(state);
  const total = Object.values(sp.trickCounts ?? {}).reduce((a, n) => a + (n ?? 0), 0);
  if (!(needed > 0 && total >= needed)) return [];

  const ids = selectPlayersOrdered(state).map((p) => p.id);
  const bidsMap = (state.rounds[roundNo]?.bids ?? {}) as Record<string, number | undefined>;
  const batch: AppEvent[] = [];
  for (const pid of ids) {
    // Skip absent players for this round (if present map says false)
    if (state.rounds[roundNo]?.present?.[pid] === false) continue;
    const won = sp.trickCounts?.[pid] ?? 0;
    const made = won === (bidsMap[pid] ?? 0);
    batch.push(events.madeSet({ round: roundNo, playerId: pid, made }));
  }
  // Mark SP phase done and finalize scoring row
  batch.push(events.spPhaseSet({ phase: 'done' }));
  batch.push(events.roundFinalize({ round: roundNo }));

  // If more rounds remain, prepare next deal
  if (roundNo < 10) {
    const nextRound = roundNo + 1;
    const ordered = ids;
    const curDealerId = sp.dealerId ?? ordered[0]!;
    const curIdx = Math.max(0, ordered.indexOf(curDealerId));
    const nextDealer = ordered[(curIdx + 1) % ordered.length]!;
    const nextTricks = tricksForRound(nextRound);
    const useTwoDecks = opts.useTwoDecks ?? ordered.length > 5;
    const seed = opts.now ?? Date.now();
    const deal = startRound(
      {
        round: nextRound,
        players: ordered,
        dealer: nextDealer,
        tricks: nextTricks,
        useTwoDecks,
      },
      seed,
    );
    batch.push(
      events.spDeal({
        roundNo: nextRound,
        dealerId: nextDealer,
        order: deal.order,
        trump: deal.trump,
        trumpCard: { suit: deal.trumpCard.suit, rank: deal.trumpCard.rank },
        hands: deal.hands,
      }),
    );
    batch.push(events.spLeaderSet({ leaderId: deal.firstToAct }));
    batch.push(events.spPhaseSet({ phase: 'bidding' }));
    batch.push(events.roundStateSet({ round: nextRound, state: 'bidding' }));
  }
  return batch;
}
