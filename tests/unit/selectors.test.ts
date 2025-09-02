import { describe, it, expect } from 'vitest';
import { INITIAL_STATE, reduce, type AppEvent, type AppState } from '@/lib/state/types';
import {
  selectLeaders,
  selectRoundSummary,
  selectScores,
  selectRoundInfo,
  selectCumulativeScoresThrough,
  selectNextActionableRound,
  selectIsGameComplete,
} from '@/lib/state/selectors';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(
  type: T,
  payload: EventPayloadByType<T>,
  id: string,
): AppEvent => makeEvent(type, payload, { eventId: id, ts: now });

function replay(events: AppEvent[], base: AppState = INITIAL_STATE): AppState {
  return events.reduce((s, e) => reduce(s, e), base);
}

describe('selectors', () => {
  it('leaders are sorted and memoized for same state', () => {
    const s = replay([
      ev('player/added', { id: 'p1', name: 'Alice' }, 'e1'),
      ev('player/added', { id: 'p2', name: 'Bob' }, 'e2'),
      ev('score/added', { playerId: 'p1', delta: 3 }, 'e3'),
      ev('score/added', { playerId: 'p2', delta: 7 }, 'e4'),
    ]);
    const l1 = selectLeaders(s);
    const l2 = selectLeaders(s);
    expect(l1).toBe(l2);
    expect(l1.map((x) => x.id)).toEqual(['p2', 'p1']);
  });

  it('leaders recompute on new state', () => {
    const s1 = replay([
      ev('player/added', { id: 'p1', name: 'Alice' }, 'e1'),
      ev('player/added', { id: 'p2', name: 'Bob' }, 'e2'),
      ev('score/added', { playerId: 'p1', delta: 3 }, 'e3'),
    ]);
    const s2 = replay([ev('score/added', { playerId: 'p2', delta: 5 }, 'e4')], s1);
    const l1 = selectLeaders(s1);
    const l2 = selectLeaders(s2);
    expect(l1).not.toBe(l2);
    expect(l2[0].id).toBe('p2');
  });

  it('round summary computes deltas and memoizes per (state, round)', () => {
    const s1 = replay([
      ev('player/added', { id: 'p1', name: 'A' }, 'r1'),
      ev('player/added', { id: 'p2', name: 'B' }, 'r2'),
      ev('bid/set', { round: 1, playerId: 'p1', bid: 2 }, 'r3'),
      ev('bid/set', { round: 1, playerId: 'p2', bid: 1 }, 'r4'),
      ev('made/set', { round: 1, playerId: 'p1', made: true }, 'r5'),
      ev('made/set', { round: 1, playerId: 'p2', made: false }, 'r6'),
    ]);
    const sum1a = selectRoundSummary(s1, 1);
    const sum1b = selectRoundSummary(s1, 1);
    expect(sum1a).toBe(sum1b);
    const deltas = Object.fromEntries(sum1a.rows.map((r) => [r.id, r.delta]));
    expect(deltas).toEqual({ p1: 7, p2: -6 });

    // Different round param yields different reference
    const sumR2 = selectRoundSummary(s1, 2);
    expect(sumR2).not.toBe(sum1a);

    // New state (after finalization) yields different reference for same round
    const s2 = replay([ev('round/finalize', { round: 1 }, 'r7')], s1);
    const sum1c = selectRoundSummary(s2, 1);
    expect(sum1c).not.toBe(sum1a);
    expect(sum1c.state).toBe('scored');
  });

  it('selectScores returns identity stable scores object', () => {
    const s1 = replay([
      ev('player/added', { id: 'p1', name: 'A' }, 'a1'),
      ev('score/added', { playerId: 'p1', delta: 2 }, 'a2'),
    ]);
    const a = selectScores(s1);
    const b = selectScores(s1);
    expect(a).toBe(b);
    const s2 = replay([ev('score/added', { playerId: 'p1', delta: 1 }, 'a3')], s1);
    const c = selectScores(s2);
    expect(c).not.toBe(a);
    expect(c.p1).toBe(3);
  });

  it('round info computes sumBids and over/under/match', () => {
    const s1 = replay([
      ev('player/added', { id: 'p1', name: 'A' }, 'i1'),
      ev('player/added', { id: 'p2', name: 'B' }, 'i2'),
      ev('bid/set', { round: 1, playerId: 'p1', bid: 2 }, 'i3'),
      ev('bid/set', { round: 1, playerId: 'p2', bid: 1 }, 'i4'),
    ]);
    const info = selectRoundInfo(s1, 1);
    expect(info.sumBids).toBe(3);
    // round 1 tricks = 10
    expect(info.tricks).toBe(10);
    expect(info.overUnder).toBe('under');
  });

  it('cumulative scores through round reflects only scored rounds', () => {
    let s = replay([
      ev('player/added', { id: 'p1', name: 'A' }, 'c1'),
      ev('bid/set', { round: 1, playerId: 'p1', bid: 2 }, 'c2'),
      ev('made/set', { round: 1, playerId: 'p1', made: true }, 'c3'),
    ]);
    // Not finalized; should be 0
    let totals = selectCumulativeScoresThrough(s, 1);
    expect(totals.p1).toBe(0);
    // Finalize then totals update
    s = replay([ev('round/finalize', { round: 1 }, 'c4')], s);
    totals = selectCumulativeScoresThrough(s, 1);
    expect(totals.p1).toBe(7);
  });

  it('next actionable round prefers bidding/complete, else next locked after scored', () => {
    let s = replay([
      ev('player/added', { id: 'p1', name: 'A' }, 'n1'),
      ev('bid/set', { round: 1, playerId: 'p1', bid: 1 }, 'n2'),
    ]);
    // round 1 is bidding
    expect(selectNextActionableRound(s)).toBe(1);
    s = replay(
      [
        ev('made/set', { round: 1, playerId: 'p1', made: true }, 'n3'),
        ev('round/state-set', { round: 1, state: 'complete' }, 'n4'),
      ],
      s,
    );
    expect(selectNextActionableRound(s)).toBe(1);
    s = replay([ev('round/finalize', { round: 1 }, 'n5')], s);
    // After finalize, next (round 2) should be actionable (locked after all prev scored)
    expect(selectNextActionableRound(s)).toBe(2);
  });

  it('game completion detects all rounds scored', () => {
    let s = INITIAL_STATE;
    expect(selectIsGameComplete(s)).toBe(false);
    // Score all rounds for a single player quickly
    s = replay([ev('player/added', { id: 'p', name: 'A' }, 'g0')], s);
    for (let r = 1; r <= 10; r++) {
      s = replay(
        [
          ev('bid/set', { round: r, playerId: 'p', bid: 0 }, `g${r}a`),
          ev('made/set', { round: r, playerId: 'p', made: true }, `g${r}b`),
          ev('round/finalize', { round: r }, `g${r}c`),
        ],
        s,
      );
    }
    expect(selectIsGameComplete(s)).toBe(true);
  });
});
