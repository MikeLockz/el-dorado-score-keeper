import type { AppState, AppEvent } from '@/lib/state/types';
import { events } from '@/lib/state/events';
import { tricksForRound, ROUNDS_TOTAL } from '@/lib/state/logic';
import {
  selectSpNextToPlay,
  selectSpTricksForRound,
  selectPlayersOrdered,
} from '@/lib/state/selectors';
import { bots, startRound, winnerOfTrick } from './index';
import { computePrecedingBotBids } from './auto-bid';
import type { Card } from './types';
import { isRoundDone as rulesIsRoundDone } from '@/lib/rules/sp';

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
  if (state.sp.handPhase === 'revealing') return [];
  if (state.sp.phase === 'summary') return [];
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
  return [events.spTrickPlayed({ playerId, card: { suit: card.suit, rank: card.rank } })];
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

// Helper: constructs the next-round deal batch in a single place.
// Returns [sp/deal, sp/leader-set, sp/phase-set('bidding'), round/state-set('bidding')]
export function buildNextRoundDealBatch(
  state: AppState,
  now: number,
  useTwoDecksOverride?: boolean,
): AppEvent[] {
  const ids = (state.sp.order ?? []).slice();
  const curDealerId = state.sp.dealerId ?? ids[0]!;
  const curIdx = Math.max(0, ids.indexOf(curDealerId));
  const nextDealer = ids[(curIdx + 1) % ids.length]!;
  const nextRound = (state.sp.roundNo ?? 0) + 1;
  const nextTricks = tricksForRound(nextRound);
  const useTwoDecks = useTwoDecksOverride ?? ids.length > 5;
  const seed = now;
  const deal = startRound(
    {
      round: nextRound,
      players: ids,
      dealer: nextDealer,
      tricks: nextTricks,
      useTwoDecks,
    },
    seed,
  );
  return [
    events.spDeal({
      roundNo: nextRound,
      dealerId: nextDealer,
      order: deal.order,
      trump: deal.trump,
      trumpCard: { suit: deal.trumpCard.suit, rank: deal.trumpCard.rank },
      hands: deal.hands,
    }),
    events.spLeaderSet({ leaderId: deal.firstToAct }),
    events.spPhaseSet({ phase: 'bidding' }),
    events.roundStateSet({ round: nextRound, state: 'bidding' }),
  ];
}

// If the round is done and not already scored, emit scoring + (optional) next round deal batch.
export function finalizeRoundIfDone(state: AppState, opts: FinalizeOptions = {}): AppEvent[] {
  const sp = state.sp;
  const roundNo = sp.roundNo ?? 0;
  if (roundNo <= 0) return [];
  // Already scored? do nothing
  if ((state.rounds[roundNo]?.state ?? 'locked') === 'scored') return [];
  // Gate finalization until after the last clear: if reveal is active, keep the hand visible
  if (sp.reveal) return [];
  // UI-gated: if a hold is set (end-of-round confirmation), do not auto-finalize
  // finalizeHold removed; ack/reveal gating are sufficient
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
  if (roundNo < ROUNDS_TOTAL) {
    batch.push(...buildNextRoundDealBatch(state, opts.now ?? Date.now(), opts.useTwoDecks));
  }
  return batch;
}

export type AdvanceOpts = {
  intent?: 'user' | 'auto';
  now?: number;
  summaryAutoAdvanceMs?: number; // 0 disables
  useTwoDecks?: boolean;
};

export function computeAdvanceBatch(
  state: AppState,
  now: number,
  opts: AdvanceOpts = {},
): AppEvent[] {
  const sp = state.sp;
  const intent = opts.intent ?? 'user';
  const order = sp.order ?? [];
  const plays = sp.trickPlays ?? [];

  // 0) Safety: if we're not revealing and there are no plays, but handPhase is still 'revealing',
  // normalize back to idle so play can resume (handles rare mismatch states)
  if (sp.phase === 'playing' && !sp.reveal && plays.length === 0 && sp.handPhase === 'revealing') {
    return [events.spTrickRevealClear({})];
  }

  // 1) Trick just completed → reveal batch + ack
  if (sp.phase === 'playing' && !sp.reveal && order.length > 0 && plays.length === order.length) {
    const batch = resolveCompletedTrick(state);
    if (batch.length > 0) batch.push(events.spAckSet({ ack: 'hand' }));
    return batch;
  }

  // 2) During reveal → clear + leader + reveal-clear + ack none
  if (sp.phase === 'playing' && sp.reveal) {
    const winnerId = sp.reveal.winnerId;
    return [
      events.spTrickCleared({ winnerId }),
      events.spLeaderSet({ leaderId: winnerId }),
      events.spTrickRevealClear({}),
      events.spAckSet({ ack: 'none' }),
    ];
  }

  // 3) Round finished → finalize results and enter summary
  const roundNo = sp.roundNo ?? 0;
  if (
    sp.phase === 'playing' &&
    !sp.reveal &&
    // finalizeHold removed; rely on reveal gating
    roundNo > 0 &&
    rulesIsRoundDone(roundNo, sp.trickCounts ?? {})
  ) {
    const ids = (state.sp.order ?? []).slice();
    const bidsMap = (state.rounds[roundNo]?.bids ?? {}) as Record<string, number | undefined>;
    const batch: AppEvent[] = [];
    for (const pid of ids) {
      if (state.rounds[roundNo]?.present?.[pid] === false) continue;
      const won = sp.trickCounts?.[pid] ?? 0;
      const made = won === (bidsMap[pid] ?? 0);
      batch.push(events.madeSet({ round: roundNo, playerId: pid, made }));
    }
    batch.push(events.spPhaseSet({ phase: roundNo >= ROUNDS_TOTAL ? 'game-summary' : 'summary' }));
    batch.push(events.roundFinalize({ round: roundNo }));
    batch.push(events.spSummaryEnteredSet({ at: now }));
    return batch;
  }

  // 4) Summary → continue to next round (user intent) or when timer elapsed (auto intent)
  if (sp.phase === 'summary') {
    const ms = opts.summaryAutoAdvanceMs ?? 10_000;
    if (
      intent === 'user' ||
      (ms > 0 && typeof sp.summaryEnteredAt === 'number' && now - sp.summaryEnteredAt >= ms)
    ) {
      const nextRound = (sp.roundNo ?? 0) + 1;
      const out: AppEvent[] = [];
      if (nextRound <= ROUNDS_TOTAL) {
        out.push(...buildNextRoundDealBatch(state, now, opts.useTwoDecks));
      } else {
        // End of game: enter game summary
        out.push(events.spPhaseSet({ phase: 'game-summary' }));
      }
      return out;
    }
  }

  return [];
}
