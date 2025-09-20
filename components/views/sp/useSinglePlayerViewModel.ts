'use client';

import React from 'react';
import { useAppState } from '@/components/state-provider';
import {
  events,
  selectPlayersOrderedFor,
  selectSpRotatedOrder,
  selectSpLiveOverlay,
  selectSpTrumpInfo,
  selectSpDealerName,
  selectSpTricksForRound,
  selectSpHandBySuit,
  selectSpReveal,
  selectSpIsRoundDone,
  selectCumulativeScoresAllRounds,
  type AppEvent,
  ROUNDS_TOTAL,
  roundDelta,
  tricksForRound,
} from '@/lib/state';
import type { AppState } from '@/lib/state/types';
import { bots, computeAdvanceBatch, type Card as SpCard } from '@/lib/single-player';
import { canPlayCard as ruleCanPlayCard } from '@/lib/rules/sp';
import type { Suit, Rank } from '@/lib/single-player/types';
import type {
  ScorecardPlayerColumn,
  ScorecardRoundEntry,
  ScorecardRoundView,
} from '../scorecard/ScorecardGrid';

const SUIT_ORDER: ReadonlyArray<Suit> = ['spades', 'hearts', 'diamonds', 'clubs'];

type TrickPlay = {
  playerId: string;
  card: { suit: Suit; rank: Rank };
};

type ScoreCardEntry = Readonly<{
  bid: number | null;
  taken: number | null;
  score: number;
  made: boolean | null;
  present: boolean;
}>;

export type ScoreCardRound = Readonly<{
  round: number;
  entries: Record<string, ScoreCardEntry>;
}>;

export type SinglePlayerDerivedState = Readonly<{
  players: ReadonlyArray<{ id: string; name: string; type: 'human' | 'bot' }>;
  playerNamesById: Record<string, string>;
  spPhase: AppState['sp']['phase'];
  spRoundNo: number;
  spOrder: string[];
  spHands: Record<string, ReadonlyArray<SpCard>>;
  spTrickCounts: Record<string, number>;
  spTrump: Suit | null;
  reveal: ReturnType<typeof selectSpReveal>;
  overlay: ReturnType<typeof selectSpLiveOverlay> | null;
  rotated: string[];
  tricksThisRound: number;
  trump: Suit | null;
  trumpCard: { suit: Suit; rank: Rank } | null;
  dealerName: string | null;
  isRoundDone: boolean;
  roundTotals: Record<string, number>;
  currentBids: Record<string, number | undefined>;
  currentMade: Record<string, boolean | null | undefined>;
  humanBid: number;
  isFinalRound: boolean;
  handsCompleted: number;
  handNow: number;
  totalTricksSoFar: number;
  humanBySuit: Record<Suit, ReadonlyArray<SpCard>>;
  suitOrder: ReadonlyArray<Suit>;
  trickPlays: TrickPlay[];
  tableWinnerId: string | null;
  tableCards: Record<string, { suit: Suit; rank: Rank } | null> | null;
  isTrumpBroken: boolean;
  summaryEnteredAt: number | null;
  lastTrickSnapshot: AppState['sp']['lastTrickSnapshot'];
  sessionSeed: number | null;
  leaderId: string | null;
  scoreCardRounds: ReadonlyArray<ScoreCardRound>;
  scoreCardTotals: Record<string, number>;
  scoreCardGrid: Readonly<{
    columns: ReadonlyArray<ScorecardPlayerColumn>;
    rounds: ReadonlyArray<ScorecardRoundView>;
  }>;
}>;

export function buildSinglePlayerDerivedState(
  state: AppState,
  humanId: string,
): SinglePlayerDerivedState {
  const players = selectPlayersOrderedFor(state, 'single');
  const playerNamesById: Record<string, string> = {};
  for (const player of players) playerNamesById[player.id] = player.name;
  for (const [id, name] of Object.entries(state.players ?? {})) {
    if (!playerNamesById[id]) playerNamesById[id] = name;
  }

  const sp = state.sp ?? ({} as AppState['sp']);
  const spPhase = sp?.phase ?? 'setup';
  const spRoundNo = sp?.roundNo ?? 0;
  const spOrder = Array.isArray(sp?.order) ? [...sp.order] : [];
  const spHands: Record<string, ReadonlyArray<SpCard>> = {};
  for (const [pid, hand] of Object.entries(sp?.hands ?? {})) {
    spHands[pid] = Array.isArray(hand) ? [...hand] : [];
  }
  const spTrickCounts: Record<string, number> = {
    ...(sp?.trickCounts ?? {}),
  };
  const spTrump = sp?.trump ?? null;
  const reveal = selectSpReveal(state);
  const overlay = spPhase === 'playing' ? selectSpLiveOverlay(state) : null;
  const rotated = selectSpRotatedOrder(state);
  const { trump, trumpCard } = selectSpTrumpInfo(state);
  const dealerName = selectSpDealerName(state);
  const isRoundDone = selectSpIsRoundDone(state);
  const tricksThisRound = selectSpTricksForRound(state);

  const totalsByRound = selectCumulativeScoresAllRounds(state);
  const roundTotals = totalsByRound[spRoundNo] ?? {};
  const currentRound = state.rounds[spRoundNo];
  const currentBids: Record<string, number | undefined> = { ...(currentRound?.bids ?? {}) };
  const currentMade: Record<string, boolean | null | undefined> = {
    ...(currentRound?.made ?? {}),
  };
  const humanBid = currentBids[humanId] ?? 0;
  const isFinalRound = spRoundNo >= ROUNDS_TOTAL;

  const trickPlays: TrickPlay[] = Array.isArray(sp?.trickPlays)
    ? sp.trickPlays.map((p) => ({
        playerId: p.playerId,
        card: { suit: p.card.suit, rank: p.card.rank },
      }))
    : [];
  const trickIdle = trickPlays.length === 0;
  const trickCountValues = Object.values(spTrickCounts);
  const handsCompleted = trickCountValues.reduce((total, count) => total + (count ?? 0), 0);
  const handNow = handsCompleted + (!reveal && !trickIdle ? 1 : 0);
  const totalTricksSoFar = trickCountValues.reduce((total, count) => total + (count ?? 0), 0);

  const humanBySuit = selectSpHandBySuit(state, humanId);
  const isTrumpBroken = !!sp?.trumpBroken;
  const summaryEnteredAt = sp?.summaryEnteredAt ?? null;
  const lastTrickSnapshot = sp?.lastTrickSnapshot ?? null;
  const overlayCards = overlay?.cards ?? null;
  const snapshotCards = (() => {
    if (!lastTrickSnapshot) return null;
    const map: Record<string, { suit: Suit; rank: Rank } | null> = {};
    for (const pid of spOrder) map[pid] = null;
    for (const play of lastTrickSnapshot.plays ?? []) {
      if (!play?.card) continue;
      map[play.playerId] = { suit: play.card.suit, rank: play.card.rank };
    }
    return map;
  })();
  const hasOverlayCard = overlayCards ? Object.values(overlayCards).some((card) => !!card) : false;
  const tableCards = hasOverlayCard ? overlayCards : snapshotCards;
  const tableWinnerId =
    reveal?.winnerId ?? (trickIdle ? (lastTrickSnapshot?.winnerId ?? null) : null);
  const sessionSeed = sp?.sessionSeed ?? null;
  const leaderId = sp?.leaderId ?? null;

  const roundTallies = sp?.roundTallies ?? {};
  const scoreCardRounds: ScoreCardRound[] = [];
  for (let round = 1; round <= ROUNDS_TOTAL; round++) {
    const rd = state.rounds[round];
    const includeCurrent =
      round === spRoundNo &&
      (spPhase === 'summary' || spPhase === 'game-summary' || spPhase === 'done');
    if (!rd || (!includeCurrent && rd.state !== 'scored')) continue;
    const entry: Record<string, ScoreCardEntry> = {};
    const tallies =
      roundTallies[round] ?? (round === spRoundNo ? (sp.trickCounts ?? {}) : undefined);
    for (const player of players) {
      const id = player.id;
      const absent = rd.present?.[id] === false;
      const bid = absent ? null : (rd.bids?.[id] ?? null);
      const made = absent ? null : (rd.made?.[id] ?? null);
      const taken = (() => {
        if (absent) return null;
        if (tallies && typeof tallies[id] === 'number') return tallies[id];
        if (
          round === spRoundNo &&
          (spPhase === 'summary' || spPhase === 'game-summary' || spPhase === 'done')
        ) {
          const value = sp.trickCounts?.[id];
          return typeof value === 'number' ? value : null;
        }
        return null;
      })();
      const score = absent ? 0 : roundDelta(bid ?? 0, made);
      entry[id] = {
        bid,
        taken,
        score,
        made,
        present: !absent,
      };
    }
    scoreCardRounds.push({ round, entries: entry });
  }

  const scoreCardTotals: Record<string, number> = {};
  for (const player of players) {
    scoreCardTotals[player.id] = state.scores?.[player.id] ?? 0;
  }

  const scoreCardGridColumns: ScorecardPlayerColumn[] = players.map((player) => ({
    id: player.id,
    name: player.name,
  }));

  const scoreCardEntriesByRound = new Map<number, ScoreCardRound['entries']>();
  for (const round of scoreCardRounds) {
    scoreCardEntriesByRound.set(round.round, round.entries);
  }

  const scoreCardGridRounds: ScorecardRoundView[] = [];
  for (let round = 1; round <= ROUNDS_TOTAL; round++) {
    const entries = scoreCardEntriesByRound.get(round);
    const tricks = tricksForRound(round);
    let sumBids = 0;
    const roundEntries: Record<string, ScorecardRoundEntry> = {};
    for (const player of players) {
      const entry = entries?.[player.id];
      const present = entry?.present ?? false;
      const bid = present && typeof entry?.bid === 'number' ? entry.bid : 0;
      const made = present ? (entry?.made ?? null) : null;
      const taken = present ? (entry?.taken ?? null) : null;
      if (entries && present) sumBids += bid;
      const cumulative = totalsByRound[round]?.[player.id] ?? 0;
      roundEntries[player.id] = {
        bid,
        made,
        present,
        cumulative,
        placeholder: !entries,
        taken,
      };
    }
    const overUnder = !entries
      ? 'match'
      : sumBids === tricks
        ? 'match'
        : sumBids > tricks
          ? 'over'
          : 'under';
    scoreCardGridRounds.push({
      round,
      tricks,
      state: entries ? 'scored' : 'locked',
      info: {
        sumBids,
        overUnder,
        showBidChip: !!entries,
      },
      entries: roundEntries,
    });
  }

  const scoreCardGrid = {
    columns: scoreCardGridColumns,
    rounds: scoreCardGridRounds,
  } as const;

  return {
    players,
    playerNamesById,
    spPhase,
    spRoundNo,
    spOrder,
    spHands,
    spTrickCounts,
    spTrump,
    reveal,
    overlay,
    rotated,
    tricksThisRound,
    trump,
    trumpCard,
    dealerName,
    isRoundDone,
    roundTotals,
    currentBids,
    currentMade,
    humanBid,
    isFinalRound,
    handsCompleted,
    handNow,
    totalTricksSoFar,
    humanBySuit,
    suitOrder: SUIT_ORDER,
    trickPlays,
    tableWinnerId,
    tableCards,
    isTrumpBroken,
    summaryEnteredAt,
    lastTrickSnapshot,
    sessionSeed,
    leaderId,
    scoreCardRounds,
    scoreCardTotals,
    scoreCardGrid,
  };
}

type ConfirmBidDeps = {
  botBid: typeof bots.botBid;
};

export function buildConfirmBidBatch(
  state: AppState,
  args: {
    humanId: string;
    bid: number;
    derived: SinglePlayerDerivedState;
    rng: () => number;
  },
  deps: ConfirmBidDeps = { botBid: bots.botBid },
): AppEvent[] {
  const { humanId, bid, derived, rng } = args;
  if (derived.spPhase !== 'bidding') return [];
  if (!derived.spTrump) return [];
  const roundNo = derived.spRoundNo;
  const batch: AppEvent[] = [events.bidSet({ round: roundNo, playerId: humanId, bid })];

  for (const pid of derived.spOrder) {
    if (pid === humanId) continue;
    const currentBid = derived.currentBids[pid];
    if (currentBid == null) {
      const bidsForBot: Record<string, number> = {};
      for (const [id, value] of Object.entries(derived.currentBids)) {
        if (typeof value === 'number') bidsForBot[id] = value;
      }
      const amount = deps.botBid(
        {
          trump: derived.spTrump,
          hand: (derived.spHands[pid] ?? []) as SpCard[],
          tricksThisRound: derived.tricksThisRound,
          seatIndex: derived.spOrder.findIndex((x) => x === pid),
          bidsSoFar: bidsForBot,
          selfId: pid,
          rng,
        },
        'normal',
      );
      batch.push(events.bidSet({ round: roundNo, playerId: pid, bid: amount }));
    }
  }

  batch.push(events.roundStateSet({ round: roundNo, state: 'playing' }));
  batch.push(events.spPhaseSet({ phase: 'playing' }));
  return batch;
}

export function useSinglePlayerViewModel({ humanId, rng }: { humanId: string; rng: () => number }) {
  const { state, append, appendMany, isBatchPending, height } = useAppState();
  const derived = React.useMemo(
    () => buildSinglePlayerDerivedState(state, humanId),
    [state, humanId],
  );

  const isDev = typeof process !== 'undefined' ? process.env?.NODE_ENV !== 'production' : false;

  const playerName = React.useCallback(
    (pid: string) => derived.playerNamesById[pid] ?? (isDev ? pid : 'Unknown'),
    [derived.playerNamesById, isDev],
  );

  const playerLabel = React.useCallback(
    (pid: string) => (pid === humanId ? `${playerName(pid)} (you)` : playerName(pid)),
    [humanId, playerName],
  );

  const userAdvanceBatch = React.useMemo(
    () => computeAdvanceBatch(state, Date.now(), { intent: 'user' }),
    [state],
  );

  const canPlayCard = React.useCallback(
    (card: SpCard) => {
      if (derived.spPhase !== 'playing') return false;
      if (derived.reveal) return false;
      if (!derived.spTrump) return false;
      const result = ruleCanPlayCard(
        {
          order: derived.spOrder,
          leaderId: derived.leaderId,
          trickPlays: derived.trickPlays.map((p) => ({
            playerId: p.playerId,
            card: { suit: p.card.suit, rank: p.card.rank },
          })),
          hands: derived.spHands,
          trump: derived.spTrump,
          trumpBroken: derived.isTrumpBroken,
        },
        humanId,
        { suit: card.suit, rank: card.rank },
      );
      return result.ok;
    },
    [derived, humanId],
  );

  const playCard = React.useCallback(
    async (card: SpCard) => {
      if (!canPlayCard(card)) return;
      await append(
        events.spTrickPlayed({ playerId: humanId, card: { suit: card.suit, rank: card.rank } }),
      );
    },
    [append, canPlayCard, humanId],
  );

  const onConfirmBid = React.useCallback(
    async (bid: number) => {
      if (isBatchPending) return;
      if (derived.spPhase !== 'bidding') return;
      if (!derived.spTrump) return;
      const batch = buildConfirmBidBatch(state, { humanId, bid, derived, rng });
      if (batch.length === 0) return;
      await appendMany(batch);
    },
    [appendMany, derived, humanId, isBatchPending, rng, state],
  );

  return {
    state,
    append,
    appendMany,
    isBatchPending,
    height,
    players: derived.players,
    playerName,
    playerLabel,
    spPhase: derived.spPhase,
    spRoundNo: derived.spRoundNo,
    spOrder: derived.spOrder,
    spHands: derived.spHands,
    spTrickCounts: derived.spTrickCounts,
    spTrump: derived.spTrump,
    reveal: derived.reveal,
    overlay: derived.overlay,
    rotated: derived.rotated,
    tricksThisRound: derived.tricksThisRound,
    trump: derived.trump,
    trumpCard: derived.trumpCard,
    dealerName: derived.dealerName,
    isRoundDone: derived.isRoundDone,
    roundTotals: derived.roundTotals,
    currentBids: derived.currentBids,
    currentMade: derived.currentMade,
    humanBid: derived.humanBid,
    isFinalRound: derived.isFinalRound,
    handsCompleted: derived.handsCompleted,
    handNow: derived.handNow,
    totalTricksSoFar: derived.totalTricksSoFar,
    humanBySuit: derived.humanBySuit,
    suitOrder: derived.suitOrder,
    userAdvanceBatch,
    canPlayCard,
    playCard,
    onConfirmBid,
    isTrumpBroken: derived.isTrumpBroken,
    summaryEnteredAt: derived.summaryEnteredAt,
    trickPlays: derived.trickPlays,
    tableWinnerId: derived.tableWinnerId,
    tableCards: derived.tableCards,
    lastTrickSnapshot: derived.lastTrickSnapshot,
    sessionSeed: derived.sessionSeed,
    leaderId: derived.leaderId,
    scoreCardRounds: derived.scoreCardRounds,
    scoreCardTotals: derived.scoreCardTotals,
    scoreCardGrid: derived.scoreCardGrid,
  } as const;
}
