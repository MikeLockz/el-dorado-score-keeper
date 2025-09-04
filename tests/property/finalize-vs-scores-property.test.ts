import { describe, it, expect } from 'vitest';
import { INITIAL_STATE, reduce, type AppEvent, type AppState } from '@/lib/state/types';
import { selectCumulativeScoresThrough } from '@/lib/state/selectors';
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

function replay(events: AppEvent[], base: AppState = INITIAL_STATE): AppState {
  return events.reduce((s, e) => reduce(s, e), base);
}

describe('property: finalize events drive scores equal to derived cumulative totals', () => {
  it('scores object equals derived fold of scored rounds across many seeds', () => {
    // Use a broader seed range to shake out edge cases deterministically
    for (let seed = 100; seed < 120; seed++) {
      const rnd = mulberry32(seed);
      const playerCount = 2 + Math.floor(rnd() * 4); // 2..5 players
      const players = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
      let s = INITIAL_STATE;
      s = replay(players.map((id, i) => ev('player/added', { id, name: `P${i + 1}` }, `pl-${seed}-${i}`)), s);

      const finalized = new Set<number>();
      for (let r = 1; r <= 10; r++) {
        for (const id of players) {
          // 80% chance to set a bid (some out-of-range to exercise clamp); 20% missing
          if (rnd() < 0.8) {
            const rawBid = Math.floor(rnd() * 16) - 3; // -3..12
            s = replay([ev('bid/set', { round: r, playerId: id, bid: rawBid }, `b-${seed}-${r}-${id}`)], s);
          }
          // 70% chance to set made; 30% missing -> defaults to false in finalize
          if (rnd() < 0.7) {
            const made = rnd() < 0.5;
            s = replay([ev('made/set', { round: r, playerId: id, made }, `m-${seed}-${r}-${id}`)], s);
          }
        }
        // 60% chance to finalize this round; ensure only once per round
        if (rnd() < 0.6 && !finalized.has(r)) {
          s = replay([ev('round/finalize', { round: r }, `f-${seed}-${r}`)], s);
          finalized.add(r);
        }
      }
      // Ensure at least one round finalized
      if (finalized.size === 0) {
        s = replay([ev('round/finalize', { round: 1 }, `f-${seed}-force`)], s);
        finalized.add(1);
      }

      // Manual fold of scored rounds equals scores object
      const manual: Record<string, number> = {};
      for (const id of Object.keys(s.players)) manual[id] = 0;
      for (let r = 1; r <= 10; r++) {
        const rd = s.rounds[r];
        if (!rd || rd.state !== 'scored') continue;
        for (const id of Object.keys(s.players)) {
          const bid = rd.bids[id] ?? 0;
          const made = rd.made[id] ?? false;
          manual[id] = (manual[id] ?? 0) + roundDelta(bid, made);
        }
      }
      expect(s.scores).toEqual(manual);
      // And matches selector through round 10
      const through = selectCumulativeScoresThrough(s, 10);
      expect(through).toEqual(manual);
    }
  });
});

