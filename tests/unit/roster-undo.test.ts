import { describe, it, expect } from 'vitest';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';
import { events } from '@/lib/state/events';
import * as undo from '@/lib/roster/undo';

describe('roster undo stack', () => {
  it('pushes snapshots and undoes to previous roster state', () => {
    let s: AppState = INITIAL_STATE;
    s = reduce(s, events.rosterCreated({ rosterId: 'r', name: 'SP', type: 'single' }));
    s = reduce(s, events.rosterPlayerAdded({ rosterId: 'r', id: 'a', name: 'A' }));
    s = reduce(s, events.rosterPlayerAdded({ rosterId: 'r', id: 'b', name: 'B' }));
    undo.push(s, 'r');
    s = reduce(s, events.rosterPlayerAdded({ rosterId: 'r', id: 'c', name: 'C' }));
    expect(Object.keys(s.rosters['r']!.playersById)).toEqual(['a', 'b', 'c']);
    const u1 = undo.undo(s, 'r');
    expect(Object.keys(u1.rosters['r']!.playersById)).toEqual(['a', 'b']);
  });
});
