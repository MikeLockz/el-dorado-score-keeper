import { describe, it, expect } from 'vitest';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';
import { events } from '@/lib/state/events';

describe('legacy player/* mapping to roster', () => {
  it('creates scorecard roster on player/added and keeps it in sync', () => {
    let s: AppState = INITIAL_STATE;
    s = reduce(s, events.playerAdded({ id: 'p1', name: 'A' }));
    expect(s.activeScorecardRosterId).toBeTypeOf('string');
    const rid = s.activeScorecardRosterId!;
    expect(s.rosters[rid].playersById).toEqual({ p1: 'A' });
    s = reduce(s, events.playerAdded({ id: 'p2', name: 'B' }));
    expect(Object.keys(s.rosters[rid].playersById).sort()).toEqual(['p1', 'p2']);
    s = reduce(s, events.playerRenamed({ id: 'p2', name: 'Bee' }));
    expect(s.rosters[rid].playersById.p2).toBe('Bee');
    s = reduce(s, events.playersReordered({ order: ['p2', 'p1'] }));
    expect(s.rosters[rid].displayOrder).toEqual({ p2: 0, p1: 1 });
    s = reduce(s, events.playerRemoved({ id: 'p1' }));
    expect(Object.keys(s.rosters[rid].playersById)).toEqual(['p2']);
  });
});
