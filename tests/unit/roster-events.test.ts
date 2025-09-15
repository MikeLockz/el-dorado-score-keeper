import { describe, it, expect } from 'vitest';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';
import { events } from '@/lib/state/events';

describe('roster events', () => {
  it('creates, activates, adds/renames/removes players, reorders, and resets', () => {
    const rid = 'r1';
    let s: AppState = INITIAL_STATE;
    s = reduce(s, events.rosterCreated({ rosterId: rid, name: 'Score Card', type: 'scorecard' }));
    expect(Object.keys(s.rosters)).toEqual([rid]);
    expect(s.rosters[rid].name).toBe('Score Card');
    expect(s.activeScorecardRosterId).toBeNull();

    s = reduce(s, events.rosterActivated({ rosterId: rid, mode: 'scorecard' }));
    expect(s.activeScorecardRosterId).toBe(rid);

    s = reduce(s, events.rosterPlayerAdded({ rosterId: rid, id: 'p1', name: 'Alice' }));
    s = reduce(s, events.rosterPlayerAdded({ rosterId: rid, id: 'p2', name: 'Bob' }));
    expect(s.rosters[rid].playersById).toEqual({ p1: 'Alice', p2: 'Bob' });
    expect(Object.values(s.rosters[rid].displayOrder).sort()).toEqual([0, 1]);

    s = reduce(s, events.rosterPlayersReordered({ rosterId: rid, order: ['p2', 'p1'] }));
    expect(s.rosters[rid].displayOrder).toEqual({ p2: 0, p1: 1 });

    s = reduce(s, events.rosterPlayerRenamed({ rosterId: rid, id: 'p2', name: 'B' }));
    expect(s.rosters[rid].playersById.p2).toBe('B');

    s = reduce(s, events.rosterPlayerRemoved({ rosterId: rid, id: 'p1' }));
    expect(Object.keys(s.rosters[rid].playersById)).toEqual(['p2']);
    expect(s.rosters[rid].displayOrder).toEqual({ p2: 0 });

    s = reduce(s, events.rosterReset({ rosterId: rid }));
    expect(Object.keys(s.rosters[rid].playersById).length).toBe(0);
    expect(Object.keys(s.rosters[rid].displayOrder).length).toBe(0);
  });
});
