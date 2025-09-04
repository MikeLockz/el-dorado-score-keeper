import { describe, it, expect } from 'vitest';
import { INITIAL_STATE, reduce, type AppEvent, type AppState } from '@/lib/state/types';
import { selectCumulativeScoresAllRounds, selectNextActionableRound } from '@/lib/state/selectors';
import { tricksForRound, ROUNDS_TOTAL } from '@/lib/state/logic';
import { roundDelta } from '@/lib/state/logic';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';

// Deterministic PRNG (Mulberry32)
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(
  type: T,
  payload: EventPayloadByType<T>,
  id: string,
): AppEvent => makeEvent(type, payload, { eventId: id, ts: now });

function replay(events: AppEvent[], base: AppState = INITIAL_STATE) {
  return events.reduce((s, e) => reduce(s, e), base);
}

describe('property: cumulative vs scored-only folding; next actionable under random states', () => {
  it('cumulative by round equals manual fold of scored rounds only', () => {
    const seeds = [5, 7, 11, 13, 17];
    for (const seed of seeds) {
      const rnd = mulberry32(seed);
      const playerCount = 2 + Math.floor(rnd() * 4); // 2..5
      const players = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
      let s = INITIAL_STATE;
      // add players
      s = replay(
        players.map((id, i) => ev('player/added', { id, name: `P${i + 1}` }, `pl-${seed}-${id}`)),
        s,
      );
      // randomize bids/made across rounds; mark some rounds as scored
      for (let r = 1; r <= ROUNDS_TOTAL; r++) {
        for (const id of players) {
          // 70% chance we set a bid; values may exceed clamp range
          if (rnd() < 0.7) {
            const rawBid = Math.floor(rnd() * 14) - 2; // -2..11
            s = replay(
              [ev('bid/set', { round: r, playerId: id, bid: rawBid }, `b-${seed}-${r}-${id}`)],
              s,
            );
          }
          // 60% chance we set made; otherwise missing leaves default false in cumulative
          if (rnd() < 0.6) {
            const made = rnd() < 0.5;
            s = replay(
              [ev('made/set', { round: r, playerId: id, made }, `m-${seed}-${r}-${id}`)],
              s,
            );
          }
        }
        // 55% chance to mark round scored via state-set to avoid touching scores object
        if (rnd() < 0.55)
          s = replay([ev('round/state-set', { round: r, state: 'scored' }, `rs-${seed}-${r}`)], s);
      }

      const cum = selectCumulativeScoresAllRounds(s);
      // Manual fold: only scored rounds contribute, missing bid -> 0, missing made -> false
      const manual: Record<number, Record<string, number>> = {};
      const ids = Object.keys(s.players);
      let running: Record<string, number> = {};
      for (const id of ids) running[id] = 0;
      for (let r = 1; r <= ROUNDS_TOTAL; r++) {
        const rd = s.rounds[r];
        const next: Record<string, number> = { ...running };
        if (rd && rd.state === 'scored') {
          for (const id of ids) {
            const bid = rd.bids[id] ?? 0;
            const made = rd.made[id] ?? false;
            next[id] = (next[id] ?? 0) + roundDelta(bid, made);
          }
        }
        manual[r] = next;
        running = next;
      }
      expect(cum).toEqual(manual);
    }
  });

  it('selectNextActionableRound matches expectation for random round state permutations', () => {
    const seeds = [21, 22, 23, 24, 25];
    const states: Array<'locked' | 'bidding' | 'complete' | 'scored'> = [
      'locked',
      'bidding',
      'complete',
      'scored',
    ];
    for (const seed of seeds) {
      const rnd = mulberry32(seed);
      let s = INITIAL_STATE;
      // ensure one player exists (not required, but closer to real state)
      s = replay([ev('player/added', { id: 'p', name: 'P' }, `pl-${seed}`)], s);
      // assign random state to each round
      for (let r = 1; r <= ROUNDS_TOTAL; r++) {
        const st = states[Math.floor(rnd() * states.length)];
        s = replay([ev('round/state-set', { round: r, state: st }, `st-${seed}-${r}`)], s);
      }
      // manual expected based on selector algorithm
      let firstLockedAfterScored: number | null = null;
      let expected: number | null = null;
      outer: for (let r = 1; r <= ROUNDS_TOTAL; r++) {
        const st = s.rounds[r]?.state ?? 'locked';
        if (st === 'bidding' || st === 'complete') {
          expected = r;
          break outer;
        }
        if (st === 'locked') {
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
            break outer;
          }
        }
      }
      if (expected == null && firstLockedAfterScored != null) expected = firstLockedAfterScored;
      if (expected == null) {
        for (let r = 1; r <= ROUNDS_TOTAL; r++) {
          const st = s.rounds[r]?.state ?? 'locked';
          if (st !== 'scored') {
            expected = r;
            break;
          }
        }
      }
      if (expected == null) expected = null;

      const actual = selectNextActionableRound(s);
      expect(actual).toBe(expected);
    }
  });
});
