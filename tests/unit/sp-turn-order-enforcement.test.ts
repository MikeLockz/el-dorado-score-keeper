import { describe, it, expect } from 'vitest';
import { reduce, INITIAL_STATE, events, type AppState } from '@/lib/state';

function makeState(partial: Partial<AppState>): AppState {
  return {
    ...INITIAL_STATE,
    ...partial,
    rounds: { ...INITIAL_STATE.rounds, ...(partial.rounds || {}) },
    sp: { ...INITIAL_STATE.sp, ...(partial.sp || {}) },
  } as AppState;
}

describe('SP reducer: turn order enforcement', () => {
  it('ignores out-of-turn plays and accepts in-order plays; updates hands', () => {
    const order = ['p1', 'p3', 'p4', 'bob'];
    const hands = {
      p1: [
        { suit: 'spades', rank: 9 },
        { suit: 'hearts', rank: 7 },
      ],
      p3: [
        { suit: 'spades', rank: 6 },
        { suit: 'clubs', rank: 2 },
      ],
      p4: [
        { suit: 'spades', rank: 3 },
        { suit: 'diamonds', rank: 4 },
      ],
      bob: [
        { suit: 'spades', rank: 14 },
        { suit: 'hearts', rank: 5 },
      ],
    } as AppState['sp']['hands'];
    let s = makeState({
      players: { p1: 'P1', p3: 'P3', p4: 'P4', bob: 'Bob' },
      sp: {
        phase: 'playing',
        roundNo: 4,
        dealerId: 'bob',
        order,
        trump: 'diamonds',
        trumpCard: { suit: 'diamonds', rank: 12 },
        hands,
        trickPlays: [],
        trickCounts: { p1: 0, p3: 0, p4: 0, bob: 0 },
        trumpBroken: false,
        leaderId: 'p1',
      },
    });

    // Out-of-turn: p3 tries to lead while leaderId = p1
    const p3Lead = events.spTrickPlayed({ playerId: 'p3', card: { suit: 'spades', rank: 6 } });
    const s1 = reduce(s, p3Lead);
    expect(s1.sp.trickPlays.length).toBe(0);
    expect(s1.sp.hands.p3.length).toBe(2); // unchanged

    // In-turn: p1 leads spades 9
    s = reduce(s, events.spTrickPlayed({ playerId: 'p1', card: { suit: 'spades', rank: 9 } }));
    expect(s.sp.trickPlays.length).toBe(1);
    expect(s.sp.trickPlays[0]).toEqual({ playerId: 'p1', card: { suit: 'spades', rank: 9 } });
    expect(s.sp.hands.p1.length).toBe(1);

    // Out-of-turn: p4 attempts before p3
    const out = reduce(s, events.spTrickPlayed({ playerId: 'p4', card: { suit: 'spades', rank: 3 } }));
    expect(out.sp.trickPlays.length).toBe(1); // ignored
    expect(out.sp.hands.p4.length).toBe(2);

    // In-order: p3 now plays
    s = reduce(s, events.spTrickPlayed({ playerId: 'p3', card: { suit: 'spades', rank: 6 } }));
    expect(s.sp.trickPlays.length).toBe(2);
    expect(s.sp.trickPlays[1]).toEqual({ playerId: 'p3', card: { suit: 'spades', rank: 6 } });
    expect(s.sp.hands.p3.length).toBe(1);
  });
});

