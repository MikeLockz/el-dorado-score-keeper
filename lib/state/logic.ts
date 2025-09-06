import type { AppState, RoundData, RoundState } from './types';

export const ROUNDS_TOTAL = 10;

export function tricksForRound(roundNo: number): number {
  return Math.max(0, Math.min(10, 11 - Math.floor(roundNo)));
}

export function clampBid(round: number, bid: number): number {
  const max = tricksForRound(round);
  return Math.max(0, Math.min(max, Math.floor(bid)));
}

export function roundDelta(bid: number, made: boolean | null | undefined): number {
  if (made == null) return 0;
  const base = 5 + Math.floor(bid);
  return (made ? 1 : -1) * base;
}

export function initialRounds(total: number = ROUNDS_TOTAL): Record<number, RoundData> {
  const rounds: Record<number, RoundData> = {};
  for (let i = 1; i <= total; i++) {
    rounds[i] = { state: i === 1 ? 'bidding' : 'locked', bids: {}, made: {} } as RoundData;
  }
  return rounds;
}

export function finalizeRound(prev: AppState, round: number): AppState {
  const r = prev.rounds[round] ?? { state: 'locked', bids: {}, made: {} };
  // Idempotency: if this round is already scored, do nothing
  if ((r.state as RoundState) === 'scored') return prev;
  const scores = { ...prev.scores };
  for (const pid of Object.keys(prev.players)) {
    // Only count if player is present (treat missing as present for compatibility)
    if (r.present?.[pid] === false) continue;
    const bid = r.bids[pid] ?? 0;
    const made = r.made[pid] ?? false;
    scores[pid] = (scores[pid] ?? 0) + roundDelta(bid, made);
  }
  const rounds = { ...prev.rounds, [round]: { ...r, state: 'scored' as RoundState } };
  const nextRound = round + 1;
  const nr = rounds[nextRound];
  if (nr && nr.state === 'locked') {
    rounds[nextRound] = { ...nr, state: 'bidding' };
  }
  return { ...prev, scores, rounds };
}
