import { describe, it, expect } from 'vitest';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';
import { events } from '@/lib/state/events';

describe('roster guards', () => {
  it('enforces max 10 players and non-empty unique names', () => {
    let s: AppState = INITIAL_STATE;
    s = reduce(s, events.rosterCreated({ rosterId: 'r', name: 'SP', type: 'single' }));
    // Add 10 players
    for (let i = 0; i < 10; i++) {
      s = reduce(s, events.rosterPlayerAdded({ rosterId: 'r', id: `p${i}`, name: `N${i}` }));
    }
    expect(Object.keys(s.rosters['r']!.playersById).length).toBe(10);
    // 11th ignored
    const s2 = reduce(s, events.rosterPlayerAdded({ rosterId: 'r', id: 'pX', name: 'NX' }));
    expect(Object.keys(s2.rosters['r']!.playersById).length).toBe(10);
    // Blank ignored
    const s3 = reduce(s, events.rosterPlayerAdded({ rosterId: 'r', id: 'pY', name: '   ' }));
    expect(Object.keys(s3.rosters['r']!.playersById).length).toBe(10);
    // Duplicate (case-insensitive) ignored
    const s4 = reduce(s, events.rosterPlayerAdded({ rosterId: 'r', id: 'pZ', name: 'n1' }));
    expect(Object.keys(s4.rosters['r']!.playersById).length).toBe(10);
  });

  it('rename enforces non-empty unique names', () => {
    let s: AppState = INITIAL_STATE;
    s = reduce(s, events.rosterCreated({ rosterId: 'r', name: 'SP', type: 'single' }));
    s = reduce(s, events.rosterPlayerAdded({ rosterId: 'r', id: 'p1', name: 'A' }));
    s = reduce(s, events.rosterPlayerAdded({ rosterId: 'r', id: 'p2', name: 'B' }));
    const s1 = reduce(s, events.rosterPlayerRenamed({ rosterId: 'r', id: 'p1', name: ' ' }));
    expect(s1.rosters['r']!.playersById['p1']).toBe('A');
    const s2 = reduce(s, events.rosterPlayerRenamed({ rosterId: 'r', id: 'p1', name: 'b' }));
    expect(s2.rosters['r']!.playersById['p1']).toBe('A');
    const s3 = reduce(s, events.rosterPlayerRenamed({ rosterId: 'r', id: 'p1', name: 'Z' }));
    expect(s3.rosters['r']!.playersById['p1']).toBe('Z');
  });

  it('enforces min 2 players on removal', () => {
    let s: AppState = INITIAL_STATE;
    s = reduce(s, events.rosterCreated({ rosterId: 'r', name: 'SP', type: 'single' }));
    s = reduce(s, events.rosterPlayerAdded({ rosterId: 'r', id: 'p1', name: 'A' }));
    s = reduce(s, events.rosterPlayerAdded({ rosterId: 'r', id: 'p2', name: 'B' }));
    // Removing when only 2 should be ignored
    const s1 = reduce(s, events.rosterPlayerRemoved({ rosterId: 'r', id: 'p1' }));
    expect(Object.keys(s1.rosters['r']!.playersById).length).toBe(2);
    // Add third; removal allowed
    const s2 = reduce(s, events.rosterPlayerAdded({ rosterId: 'r', id: 'p3', name: 'C' }));
    const s3 = reduce(s2, events.rosterPlayerRemoved({ rosterId: 'r', id: 'p3' }));
    expect(Object.keys(s3.rosters['r']!.playersById).length).toBe(2);
  });
});
