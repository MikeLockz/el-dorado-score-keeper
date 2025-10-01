import type { AppState, RoundData } from './types';
import { withSpanSync } from '@/lib/observability/spans';

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
  return withSpanSync(
    'state.finalize-round',
    {
      round,
      playerCount: Object.keys(prev.players ?? {}).length,
    },
    (span) => {
      const r: RoundData =
        prev.rounds[round] ?? ({ state: 'locked', bids: {}, made: {} } as RoundData);
      if (r.state === 'scored') {
        span?.setAttribute('round.alreadyScored', true);
        return prev;
      }

      const scores = { ...prev.scores };
      let updatedPlayers = 0;
      for (const pid of Object.keys(prev.players)) {
        if (r.present?.[pid] === false) continue;
        const bid = r.bids[pid] ?? 0;
        const madeRaw = r.made?.[pid];
        const made = madeRaw ?? false;
        scores[pid] = (scores[pid] ?? 0) + roundDelta(bid, made);
        updatedPlayers += 1;
      }

      const rounds: Record<number, RoundData> = {
        ...prev.rounds,
        [round]: { ...r, state: 'scored' } as RoundData,
      };
      const nextRound = round + 1;
      const nr = rounds[nextRound];
      if (nr && nr.state === 'locked') {
        rounds[nextRound] = { ...nr, state: 'bidding' };
      }

      span?.setAttribute('scores.updated', updatedPlayers);
      if (nr) {
        span?.setAttribute('round.nextState', nr.state === 'locked' ? 'bidding' : nr.state);
      }

      return { ...prev, scores, rounds };
    },
    { runtime: 'browser' },
  );
}
