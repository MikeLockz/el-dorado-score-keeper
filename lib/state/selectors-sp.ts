import type { AppState } from './types';
import type { Suit, Rank } from '@/lib/single-player/types';
import { tricksForRound } from './logic';

// Simple memo helpers keyed by object identity and primitive args.
function memo1<A extends object, R>(fn: (a: A) => R) {
  let lastA: A | null = null;
  let lastR: R | null = null;
  return (a: A): R => {
    if (lastA === a && lastR !== null) return lastR as R;
    const r = fn(a);
    lastA = a;
    lastR = r;
    return r;
  };
}

function memo2<A1 extends object, A2 extends number | string, R>(fn: (a1: A1, a2: A2) => R) {
  let lastA1: A1 | null = null;
  let lastA2: A2 | null = null;
  let lastR: R | null = null;
  return (a1: A1, a2: A2): R => {
    if (lastA1 === a1 && lastA2 === a2 && lastR !== null) return lastR as R;
    const r = fn(a1, a2);
    lastA1 = a1;
    lastA2 = a2;
    lastR = r;
    return r;
  };
}

export const selectSpRotatedOrder = memo1((s: AppState): string[] => {
  if (!s.sp) return [];
  const order: string[] = s.sp.order ?? [];
  if (order.length === 0) return order;
  const tps: Array<{ playerId: string }> = s.sp.trickPlays ?? [];
  // Prefer the actual leader of the current trick if a play exists; otherwise, use stored leaderId
  const firstPlayLeader = tps[0]?.playerId || null;
  const nominalLeader: string | null = s.sp.leaderId ?? null;
  const leader = firstPlayLeader || nominalLeader;
  if (!leader) return order;
  const idx = order.indexOf(leader);
  if (idx < 0) return order;
  return [...order.slice(idx), ...order.slice(0, idx)];
});

export const selectSpNextToPlay = memo1((s: AppState): string | null => {
  if (!s.sp || s.sp.phase !== 'playing') return null;
  const rotated = selectSpRotatedOrder(s);
  const idx = (s.sp.trickPlays ?? []).length;
  return idx < rotated.length ? rotated[idx]! : null;
});

export const selectSpLeader = memo1((s: AppState): string | null => {
  return s.sp?.leaderId ?? null;
});

export type SpLiveOverlay = {
  round: number;
  currentPlayerId: string | null;
  cards: Record<string, { suit: Suit; rank: Rank } | null>;
  counts: Record<string, number>;
};

export const selectSpLiveOverlay = memo1((s: AppState): SpLiveOverlay | null => {
  if (!s.sp) return null;
  const round = s.sp.roundNo ?? 0;
  const currentPlayerId = selectSpNextToPlay(s);
  const order: string[] = s.sp.order ?? [];
  const trickPlays = s.sp.trickPlays ?? [];
  const cards: Record<string, { suit: Suit; rank: Rank } | null> = {};
  for (const pid of order) cards[pid] = null;
  for (const p of trickPlays) cards[p.playerId] = { suit: p.card.suit, rank: p.card.rank };
  // Live trick counts are sourced directly from state; these now increment at reveal time
  const counts: Record<string, number> = s.sp.trickCounts ?? {};
  return { round, currentPlayerId, cards, counts };
});

export type SpTrumpInfo = {
  round: number;
  leaderId: string | null;
  trump: Suit | null;
  trumpCard: { suit: Suit; rank: Rank } | null;
};

export const selectSpTrumpInfo = memo1((s: AppState): SpTrumpInfo => {
  return {
    round: s.sp?.roundNo ?? 0,
    leaderId: s.sp?.leaderId ?? null,
    trump: s.sp?.trump ?? null,
    trumpCard: s.sp?.trumpCard ?? null,
  };
});

export const selectSpDealerName = memo1((s: AppState): string | null => {
  const dealerId = s.sp?.dealerId ?? null;
  if (!dealerId) return null;
  const name = s.players?.[dealerId] ?? null;
  return name ?? dealerId;
});

// Single-player round completion and helpers
export const selectSpTricksForRound = memo1((s: AppState): number => {
  const roundNo = s.sp?.roundNo ?? 0;
  return tricksForRound(roundNo);
});

export const selectSpIsRoundDone = memo1((s: AppState): boolean => {
  if (!s.sp) return false;
  const needed = selectSpTricksForRound(s);
  const counts = s.sp.trickCounts ?? {};
  let total = 0;
  for (const v of Object.values(counts)) total += v ?? 0;
  return total >= needed && needed > 0;
});

export type SpSuit = Suit;
export type SpCard = { suit: Suit; rank: Rank };

export const selectSpHandBySuit = memo2(
  (s: AppState, playerId: string): Record<SpSuit, SpCard[]> => {
    const hand = s.sp?.hands?.[playerId] ?? [];
    const out: Record<SpSuit, SpCard[]> = {
      spades: [],
      hearts: [],
      diamonds: [],
      clubs: [],
    };
    for (const c of hand) {
      if (!c || !c.suit) continue;
      // Push copies to avoid exposing internal arrays
      switch (c.suit) {
        case 'spades':
        case 'hearts':
        case 'diamonds':
        case 'clubs':
          out[c.suit].push({ suit: c.suit, rank: c.rank });
          break;
      }
    }
    // Sort high→low within each suit for consistent display
    const suits: SpSuit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
    for (const k of suits) out[k].sort((a, b) => b.rank - a.rank);
    return out;
  },
);

// Reveal helpers
export const selectSpReveal = (s: AppState) => s.sp?.reveal ?? null;

export const selectSpIsLastTrick = (s: AppState): boolean => {
  const needed = selectSpTricksForRound(s);
  const total = Object.values(s.sp?.trickCounts ?? {}).reduce((a, n) => a + (n ?? 0), 0);
  return needed > 0 && total + 1 === needed;
};

// Phase 1 scaffolding: primary CTA and summary data stubs (no UI usage yet)
export type SpPrimaryCTA = { label: string; kind: 'none' | 'play' | 'next' };

export const selectPrimaryCTA = memo1((_s: AppState): SpPrimaryCTA => {
  // Stub: return no-op by default; future phases compute based on engine batches
  return { label: 'Continue', kind: 'none' };
});

export type SpSummaryData = Readonly<{
  round: number | null;
  dealerId: string | null;
  trump: 'clubs' | 'diamonds' | 'hearts' | 'spades' | null;
  nextLeaderId: string | null;
  players: ReadonlyArray<{
    id: string;
    name: string;
    bid: number | null;
    made: boolean | null;
    delta: number | null;
    total: number | null;
  }>;
}>;

export const selectSummaryData = memo1((s: AppState): SpSummaryData => {
  const round = s.sp?.roundNo ?? null;
  const dealerId = s.sp?.dealerId ?? null;
  const trump = s.sp?.trump ?? null;
  const nextLeaderId = s.sp?.leaderId ?? null;
  const players = Object.keys(s.players).map((id) => ({
    id,
    name: s.players[id] ?? id,
    bid: null,
    made: null,
    delta: null,
    total: s.scores[id] ?? null,
  }));
  return { round, dealerId, trump, nextLeaderId, players };
});
