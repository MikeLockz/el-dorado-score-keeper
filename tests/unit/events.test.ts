import { describe, it, expect } from 'vitest';
import { makeEvent, events } from '@/lib/state/events';

describe('makeEvent', () => {
  it('generates eventId and ts when not provided', () => {
    const e = makeEvent('player/added', { id: 'p1', name: 'P1' });
    expect(e.type).toBe('player/added');
    expect(typeof e.eventId).toBe('string');
    expect(e.eventId.length).toBeGreaterThan(0);
    expect(typeof e.ts).toBe('number');
    expect(e.ts).toBeGreaterThan(0);
    expect(e.payload).toEqual({ id: 'p1', name: 'P1' });
  });

  it('respects provided meta eventId and ts', () => {
    const e = makeEvent(
      'round/state-set',
      { round: 2, state: 'bidding' },
      { eventId: 'custom-id', ts: 123 },
    );
    expect(e.type).toBe('round/state-set');
    expect(e.eventId).toBe('custom-id');
    expect(e.ts).toBe(123);
    expect(e.payload).toEqual({ round: 2, state: 'bidding' });
  });
});

describe('events factory helpers', () => {
  const cases: Array<[keyof typeof events, string, any]> = [
    ['playerAdded', 'player/added', { id: 'p1', name: 'P1' }],
    ['playerRenamed', 'player/renamed', { id: 'p1', name: 'New' }],
    ['playerRemoved', 'player/removed', { id: 'p1' }],
    ['playerRestored', 'player/restored', { id: 'p1' }],
    ['playerTypeSet', 'player/type-set', { id: 'p1', type: 'bot' }],
    ['playersReordered', 'players/reordered', { order: ['p1', 'p2'] }],
    ['playerDropped', 'player/dropped', { id: 'p1', fromRound: 3 }],
    ['playerResumed', 'player/resumed', { id: 'p1', fromRound: 3 }],
    ['scoreAdded', 'score/added', { playerId: 'p1', delta: 5 }],
    ['roundStateSet', 'round/state-set', { round: 2, state: 'playing' }],
    ['bidSet', 'bid/set', { round: 2, playerId: 'p1', bid: 2 }],
    ['madeSet', 'made/set', { round: 2, playerId: 'p1', made: true }],
    ['roundFinalize', 'round/finalize', { round: 2 }],
    ['rosterCreated', 'roster/created', { rosterId: 'r1', name: 'Roster', type: 'scorecard' }],
    ['rosterRenamed', 'roster/renamed', { rosterId: 'r1', name: 'Renamed' }],
    ['rosterActivated', 'roster/activated', { rosterId: 'r1', mode: 'scorecard' }],
    [
      'rosterPlayerAdded',
      'roster/player/added',
      { rosterId: 'r1', id: 'p1', name: 'A', type: 'bot' },
    ],
    ['rosterPlayerRenamed', 'roster/player/renamed', { rosterId: 'r1', id: 'p1', name: 'B' }],
    ['rosterPlayerRemoved', 'roster/player/removed', { rosterId: 'r1', id: 'p1' }],
    ['rosterPlayerTypeSet', 'roster/player/type-set', { rosterId: 'r1', id: 'p1', type: 'human' }],
    ['rosterPlayersReordered', 'roster/players/reordered', { rosterId: 'r1', order: ['p1'] }],
    ['rosterReset', 'roster/reset', { rosterId: 'r1' }],
    ['rosterArchived', 'roster/archived', { rosterId: 'r1' }],
    ['rosterRestored', 'roster/restored', { rosterId: 'r1' }],
    ['rosterDeleted', 'roster/deleted', { rosterId: 'r1' }],
    // Single-player
    ['spReset', 'sp/reset', {}],
    [
      'spDeal',
      'sp/deal',
      {
        roundNo: 4,
        dealerId: 'p1',
        order: ['p1', 'p2', 'p3', 'p4'],
        trump: 'hearts',
        trumpCard: { suit: 'hearts', rank: 12 },
        hands: {
          p1: [
            { suit: 'clubs', rank: 2 },
            { suit: 'spades', rank: 3 },
          ],
          p2: [{ suit: 'hearts', rank: 4 }],
          p3: [{ suit: 'diamonds', rank: 5 }],
          p4: [{ suit: 'clubs', rank: 6 }],
        },
      },
    ],
    ['spPhaseSet', 'sp/phase-set', { phase: 'bidding' }],
    ['spTrickPlayed', 'sp/trick/played', { playerId: 'p1', card: { suit: 'spades', rank: 9 } }],
    ['spTrickCleared', 'sp/trick/cleared', { winnerId: 'p2' }],
    ['spTrumpBrokenSet', 'sp/trump-broken-set', { broken: true }],
    ['spLeaderSet', 'sp/leader-set', { leaderId: 'p2' }],
    ['spHumanSet', 'sp/human-set', { id: 'p1' }],
  ];

  it('produces correctly typed events with payload passthrough', () => {
    for (const [fn, type, payload] of cases) {
      const e = (events[fn] as any)(payload);
      expect(e.type).toBe(type);
      expect(e.payload).toEqual(payload);
      expect(typeof e.eventId).toBe('string');
      expect(typeof e.ts).toBe('number');
    }
  });

  it('accepts meta overrides on helpers', () => {
    const e = events.playerAdded(
      { id: 'x', name: 'X', type: 'human' },
      { eventId: 'meta', ts: 42 },
    );
    expect(e.eventId).toBe('meta');
    expect(e.ts).toBe(42);
  });
});
