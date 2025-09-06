import { describe, it, expect } from 'vitest';
import { makeEvent } from '@/lib/state/events';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';
import {
  selectSpIsRoundDone,
  selectSpTricksForRound,
  selectSpNextToPlay,
  selectSpRotatedOrder,
} from '@/lib/state/selectors';

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
const ev = (type: any, payload: any, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

function replay(list: any[], base: AppState = INITIAL_STATE): AppState {
  return list.reduce((s, e) => reduce(s, e), base);
}

describe('property: randomized SP trick plays/clears preserve invariants', () => {
  it('maintains unique trick plays, bounded length, and selector invariants', () => {
    const seeds = [1, 2, 7, 42, 99];
    for (const seed of seeds) {
      const rnd = mulberry32(seed);
      // Seed 4 players and a deterministic deal for round 2 (9 tricks)
      let s = replay([
        ev('player/added', { id: 'p1', name: 'A' }, `p1-${seed}`),
        ev('player/added', { id: 'p2', name: 'B' }, `p2-${seed}`),
        ev('player/added', { id: 'p3', name: 'C' }, `p3-${seed}`),
        ev('player/added', { id: 'p4', name: 'D' }, `p4-${seed}`),
        ev(
          'sp/deal',
          {
            roundNo: 2,
            dealerId: 'p4',
            order: ['p4', 'p1', 'p2', 'p3'],
            trump: 'spades',
            trumpCard: { suit: 'spades', rank: 14 },
            hands: {
              p1: Array.from({ length: 9 }, (_, i) => ({ suit: 'clubs', rank: 2 + i })),
              p2: Array.from({ length: 9 }, (_, i) => ({ suit: 'diamonds', rank: 2 + i })),
              p3: Array.from({ length: 9 }, (_, i) => ({ suit: 'hearts', rank: 2 + i })),
              p4: Array.from({ length: 9 }, (_, i) => ({ suit: 'spades', rank: 2 + i })),
            },
          },
          `d-${seed}`,
        ),
        ev('sp/leader-set', { leaderId: 'p4' }, `l-${seed}`),
        ev('sp/phase-set', { phase: 'playing' }, `ph-${seed}`),
      ]);

      const tricks = selectSpTricksForRound(s);
      expect(tricks).toBe(9);
      const order = s.sp.order;
      const rotated = selectSpRotatedOrder(s);
      expect(rotated[0]).toBe('p4');

      // Perform a series of randomized actions
      const steps = 120;
      for (let i = 0; i < steps && !selectSpIsRoundDone(s); i++) {
        const choice = rnd();
        if (choice < 0.65) {
          // Play: sometimes from next-to-play, sometimes random (duplicates ignored by reducer)
          const next = selectSpNextToPlay(s);
          const pid = rnd() < 0.6 && next ? next : order[Math.floor(rnd() * order.length)]!;
          const hand = (s.sp.hands[pid] ?? []) as Array<{ suit: any; rank: number }>;
          if (hand.length === 0) continue;
          const idx = Math.floor(rnd() * hand.length);
          const card = hand[idx]!;
          s = replay([ev('sp/trick/played', { playerId: pid, card }, `t-${seed}-${i}`)], s);
        } else {
          // Clear: only effective if there are plays
          if ((s.sp.trickPlays?.length ?? 0) > 0) {
            const winner = order[Math.floor(rnd() * order.length)]!;
            s = replay([ev('sp/trick/cleared', { winnerId: winner }, `c-${seed}-${i}`)], s);
          }
        }

        // Invariants
        const plays = s.sp.trickPlays ?? [];
        const ids = new Set(plays.map((p) => p.playerId));
        // No duplicate players within a trick
        expect(ids.size).toBe(plays.length);
        // Trick is at most one card per seat
        expect(plays.length).toBeLessThanOrEqual(order.length);
        // Selector next-to-play aligns with rotated[length]
        const expectedNext =
          s.sp.phase === 'playing'
            ? plays.length < rotated.length
              ? rotated[plays.length]!
              : null
            : null;
        expect(selectSpNextToPlay(s)).toBe(expectedNext);
        // Round-done iff sum(trickCounts) >= tricks
        const needed = selectSpTricksForRound(s);
        const sum = Object.values(s.sp.trickCounts ?? {}).reduce((a, b: any) => a + (b ?? 0), 0);
        expect(selectSpIsRoundDone(s)).toBe(sum >= needed && needed > 0);
      }
    }
  });
});
