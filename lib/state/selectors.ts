import type { AppState, RoundData } from './types';
import { roundDelta, tricksForRound, ROUNDS_TOTAL } from './logic';

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

export type Leader = { id: string; name: string; score: number };

// Scores are already stored; expose identity-stable access and leaders list.
export const selectScores = memo1((s: AppState) => s.scores);

export const selectLeaders = memo1((s: AppState): Leader[] => {
  const leaders: Leader[] = Object.keys(s.players).map((id) => ({
    id,
    name: s.players[id]!,
    score: s.scores[id] ?? 0,
  }));
  leaders.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return leaders;
});

export type PlayerItem = { id: string; name: string };

// Preferred ordering for display: `display_order` if present; otherwise insertion order.
export const selectPlayersOrdered = memo1((s: AppState): PlayerItem[] => {
  const ids = Object.keys(s.players);
  const orderEntries = Object.entries(s.display_order ?? {});
  const hasOrder = orderEntries.length > 0;
  let sortedIds: string[];
  if (hasOrder) {
    const known = new Set(ids);
    const ordered = orderEntries
      .filter(([pid]) => known.has(pid))
      .sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0))
      .map(([pid]) => pid);
    // append any players that are missing from the mapping
    for (const id of ids) if (!ordered.includes(id)) ordered.push(id);
    sortedIds = ordered;
  } else {
    sortedIds = ids;
  }
  return sortedIds.map((id) => ({ id, name: s.players[id]! }));
});

// Roster-aware adapters
export type Mode = 'scorecard' | 'single';
export type ActiveRosterView = Readonly<{
  rosterId: string | null;
  name: string;
  playersById: Record<string, string>;
  displayOrder: Record<string, number>;
}>;

function denseOrderFrom(playersById: Record<string, string>, order?: Record<string, number>) {
  const entries = Object.entries(order ?? {}).filter(([id]) => id in playersById);
  entries.sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0));
  const ordered = entries.map(([id]) => id);
  for (const id of Object.keys(playersById)) if (!ordered.includes(id)) ordered.push(id);
  const out: Record<string, number> = {};
  for (let i = 0; i < ordered.length; i++) out[ordered[i]!] = i;
  return out;
}

export const selectActiveRoster = memo2((s: AppState, mode: Mode): ActiveRosterView | null => {
  const rid = mode === 'scorecard' ? s.activeScorecardRosterId : s.activeSingleRosterId;
  if (rid) {
    const rr = s.rosters[rid];
    if (rr) {
      return {
        rosterId: rid,
        name: rr.name,
        playersById: rr.playersById,
        displayOrder: rr.displayOrder,
      };
    }
  }
  // Legacy fallback for scorecard mode only
  if (mode === 'scorecard') {
    const playersById = s.players ?? {};
    if (Object.keys(playersById).length === 0) return null;
    const displayOrder = denseOrderFrom(playersById, s.display_order);
    return { rosterId: null, name: 'Score Card', playersById, displayOrder };
  }
  return null;
});

export const selectPlayersOrderedFor = memo2((s: AppState, mode: Mode): PlayerItem[] => {
  const r = selectActiveRoster(s, mode);
  if (!r) return [];
  const entries = Object.entries(r.displayOrder).sort((a, b) => a[1] - b[1]);
  const ids = entries.map(([id]) => id);
  for (const id of Object.keys(r.playersById)) if (!ids.includes(id)) ids.push(id);
  return ids.map((id) => ({ id, name: r.playersById[id] ?? id }));
});

export const selectHumanIdFor = memo2((s: AppState, mode: Mode): string | null => {
  if (mode === 'single') return s.humanByMode?.single ?? null;
  return null;
});

export type RoundRow = {
  id: string;
  name: string;
  bid: number;
  made: boolean | null;
  delta: number;
};
export type RoundSummary = { round: number; state: RoundData['state']; rows: RoundRow[] };

export const selectRoundSummary = memo2((s: AppState, round: number): RoundSummary => {
  const r: RoundData | undefined = s.rounds[round];
  const rows: RoundRow[] = Object.keys(s.players).map((id) => {
    const absent = r?.present?.[id] === false;
    if (absent) return { id, name: s.players[id]!, bid: 0, made: null, delta: 0 };
    const bid = r?.bids[id] ?? 0;
    const made = r?.made[id] ?? null;
    const delta = roundDelta(bid, made);
    return { id, name: s.players[id]!, bid, made, delta };
  });
  return { round, state: r?.state ?? 'locked', rows };
});

export type RoundInfo = {
  round: number;
  state: RoundData['state'];
  tricks: number;
  sumBids: number;
  overUnder: 'under' | 'over' | 'match';
};

export const selectRoundInfo = memo2((s: AppState, round: number): RoundInfo => {
  const r: RoundData | undefined = s.rounds[round];
  const tricks = tricksForRound(round);
  let sumBids = 0;
  for (const id of Object.keys(s.players)) {
    if (r?.present?.[id] === false) continue;
    sumBids += r?.bids[id] ?? 0;
  }
  const overUnder: RoundInfo['overUnder'] =
    sumBids === tricks ? 'match' : sumBids > tricks ? 'over' : 'under';
  return { round, state: r?.state ?? 'locked', tricks, sumBids, overUnder };
});

export const selectCumulativeScoresThrough = memo2(
  (s: AppState, round: number): Record<string, number> => {
    const totals: Record<string, number> = {};
    for (const id of Object.keys(s.players)) totals[id] = 0;
    for (let r = 1; r <= round; r++) {
      const rd = s.rounds[r];
      if (!rd || rd.state !== 'scored') continue;
      for (const id of Object.keys(s.players)) {
        if (rd.present?.[id] === false) continue;
        const bid = rd.bids[id] ?? 0;
        const made = rd.made[id] ?? false;
        totals[id] = (totals[id] ?? 0) + roundDelta(bid, made);
      }
    }
    return totals;
  },
);

// Heavy derived data helpers to avoid per-cell recalculation
export type CumulativeByRound = Record<number, Record<string, number>>;

export const selectCumulativeScoresAllRounds = memo1((s: AppState): CumulativeByRound => {
  // Build progressive totals once and snapshot after each round.
  const ids = Object.keys(s.players);
  let running: Record<string, number> = {};
  for (const id of ids) running[id] = 0;
  const out: CumulativeByRound = {};
  for (let r = 1; r <= ROUNDS_TOTAL; r++) {
    const rd = s.rounds[r];
    // create new object to keep snapshots stable per round
    const next: Record<string, number> = { ...running };
    if (rd && rd.state === 'scored') {
      for (const id of ids) {
        if (rd.present?.[id] === false) continue;
        const bid = rd.bids[id] ?? 0;
        const made = rd.made[id] ?? false;
        next[id] = (next[id] ?? 0) + roundDelta(bid, made);
      }
    }
    out[r] = next;
    running = next;
  }
  return out;
});

export type RoundInfoMap = Record<number, RoundInfo>;

export const selectRoundInfosAll = memo1((s: AppState): RoundInfoMap => {
  const ids = Object.keys(s.players);
  const out: RoundInfoMap = {};
  for (let r = 1; r <= ROUNDS_TOTAL; r++) {
    const rd: RoundData | undefined = s.rounds[r];
    const tricks = tricksForRound(r);
    let sumBids = 0;
    for (const id of ids) {
      if (rd?.present?.[id] === false) continue;
      sumBids += rd?.bids[id] ?? 0;
    }
    const overUnder: RoundInfo['overUnder'] =
      sumBids === tricks ? 'match' : sumBids > tricks ? 'over' : 'under';
    out[r] = { round: r, state: rd?.state ?? 'locked', tricks, sumBids, overUnder };
  }
  return out;
});

// Re-export SP selectors and types from dedicated module for compatibility
export {
  selectSpRotatedOrder,
  selectSpNextToPlay,
  selectSpLeader,
  selectSpLiveOverlay,
  selectSpTrumpInfo,
  selectSpDealerName,
  selectSpTricksForRound,
  selectSpIsRoundDone,
  selectSpHandBySuit,
} from './selectors-sp';
export type { SpLiveOverlay, SpTrumpInfo, SpSuit, SpCard } from './selectors-sp';

export const selectNextActionableRound = memo1((s: AppState): number | null => {
  // Prefer a current round in bidding/complete; otherwise the next locked after all prior scored; else null if all scored
  let firstLockedAfterScored: number | null = null;
  for (let r = 1; r <= ROUNDS_TOTAL; r++) {
    const st = s.rounds[r]?.state ?? 'locked';
    if (st === 'bidding' || st === 'complete') return r;
    if (st === 'locked') {
      // If all previous are scored, this is next actionable
      let allPrevScored = true;
      for (let p = 1; p < r; p++) {
        const pst = s.rounds[p]?.state ?? 'locked';
        if (pst !== 'scored') {
          allPrevScored = false;
          break;
        }
      }
      if (allPrevScored) {
        firstLockedAfterScored = r;
        break;
      }
    }
  }
  if (firstLockedAfterScored != null) return firstLockedAfterScored;
  // If any non-scored remains, return the first such; else null
  for (let r = 1; r <= ROUNDS_TOTAL; r++) {
    const st = s.rounds[r]?.state ?? 'locked';
    if (st !== 'scored') return r;
  }
  return null;
});

export const selectIsGameComplete = memo1((s: AppState): boolean => {
  for (let r = 1; r <= ROUNDS_TOTAL; r++)
    if ((s.rounds[r]?.state ?? 'locked') !== 'scored') return false;
  return true;
});
