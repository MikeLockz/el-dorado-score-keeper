import { describe, it, expect } from 'vitest';
import { INITIAL_STATE, reduce, type AppEvent, type AppState } from '@/lib/state/types';
import {
  selectLeaders,
  selectRoundSummary,
  selectCumulativeScoresThrough,
  selectCumulativeScoresAllRounds,
  selectNextActionableRound,
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

describe('selectors edge cases', () => {
  it('selectLeaders sorts ties by name ascending', () => {
    const s = replay([
      ev('player/added', { id: 'p1', name: 'Alice' }, 't1'),
      ev('player/added', { id: 'p2', name: 'Bob' }, 't2'),
      ev('player/added', { id: 'p3', name: 'Aaron' }, 't3'),
      // Give each +10 total
      ev('score/added', { playerId: 'p1', delta: 10 }, 't4'),
      ev('score/added', { playerId: 'p2', delta: 10 }, 't5'),
      ev('score/added', { playerId: 'p3', delta: 10 }, 't6'),
    ]);
    const leaders = selectLeaders(s);
    // All have same score; names ascending within tie
    expect(leaders.map((l) => [l.name, l.score])).toEqual([
      ['Aaron', 10],
      ['Alice', 10],
      ['Bob', 10],
    ]);
  });

  it('selectRoundSummary includes rows for players missing in round data with neutral defaults', () => {
    const s = replay([
      ev('player/added', { id: 'p1', name: 'A' }, 'm1'),
      ev('player/added', { id: 'p2', name: 'B' }, 'm2'),
      // Only p1 has bid/made for round 1; p2 is missing.
      ev('bid/set', { round: 1, playerId: 'p1', bid: 2 }, 'm3'),
      ev('made/set', { round: 1, playerId: 'p1', made: true }, 'm4'),
    ]);
    const summary = selectRoundSummary(s, 1);
    const byId = Object.fromEntries(summary.rows.map((r) => [r.id, r]));
    expect(byId.p1).toMatchObject({ bid: 2, made: true, delta: 7 });
    // p2 defaults: bid 0, made null, delta 0
    expect(byId.p2).toMatchObject({ bid: 0, made: null, delta: 0 });
  });

  it('cumulative selectors reflect negative totals', () => {
    let s = replay([
      ev('player/added', { id: 'p', name: 'A' }, 'n1'),
      ev('bid/set', { round: 1, playerId: 'p', bid: 3 }, 'n2'),
      ev('made/set', { round: 1, playerId: 'p', made: false }, 'n3'), // -(5+3) = -8
      ev('round/finalize', { round: 1 }, 'n4'),
    ]);
    const through1 = selectCumulativeScoresThrough(s, 1);
    expect(through1.p).toBe(-8);

    // Round 2: positive to ensure accumulation stays correct across signs
    s = replay(
      [
        ev('bid/set', { round: 2, playerId: 'p', bid: 1 }, 'n5'),
        ev('made/set', { round: 2, playerId: 'p', made: true }, 'n6'), // +(5+1) = +6
        ev('round/finalize', { round: 2 }, 'n7'),
      ],
      s,
    );
    const byRound = selectCumulativeScoresAllRounds(s);
    expect(byRound[1]!.p).toBe(-8);
    expect(byRound[2]!.p).toBe(-2);
  });

  it('next actionable is null when all rounds scored', () => {
    let s = replay([ev('player/added', { id: 'p', name: 'A' }, 'c0')]);
    // Score all 10 rounds quickly with empty bids/made (will be penalties but fine for flow)
    for (let r = 1; r <= 10; r++) {
      s = replay([ev('round/finalize', { round: r }, `c${r}`)], s);
    }
    expect(selectNextActionableRound(s)).toBeNull();
  });

  it('removed players do not appear in summaries or totals', () => {
    // p2 is removed after contributing in r1; ensure selectors ignore them afterwards
    let s = replay([
      ev('player/added', { id: 'p1', name: 'A' }, 'r1'),
      ev('player/added', { id: 'p2', name: 'B' }, 'r2'),
      ev('bid/set', { round: 1, playerId: 'p1', bid: 2 }, 'r3'),
      ev('made/set', { round: 1, playerId: 'p1', made: true }, 'r4'),
      ev('bid/set', { round: 1, playerId: 'p2', bid: 1 }, 'r5'),
      ev('made/set', { round: 1, playerId: 'p2', made: false }, 'r6'),
      ev('round/finalize', { round: 1 }, 'r7'),
      ev('player/removed', { id: 'p2' }, 'r8'),
    ]);
    const sum = selectRoundSummary(s, 1);
    // Only p1 remains in selectors after removal
    expect(sum.rows.map((r) => r.id)).toEqual(['p1']);
    const totals = selectCumulativeScoresThrough(s, 10);
    expect(Object.keys(totals)).toEqual(['p1']);
  });
});

