import { describe, it, expect } from 'vitest';
import type { AppState } from '@/lib/state/types';
import {
  selectActiveRoster,
  selectPlayersOrderedFor,
  selectHumanIdFor,
} from '@/lib/state/selectors';

function makeBase(): AppState {
  // Minimal valid state for selectors
  return {
    players: {},
    scores: {},
    rounds: {},
    rosters: {},
    activeScorecardRosterId: null,
    activeSingleRosterId: null,
    humanByMode: {},
    sp: {
      phase: 'setup',
      roundNo: null,
      dealerId: null,
      order: [],
      trump: null,
      trumpCard: null,
      hands: {},
      trickPlays: [],
      trickCounts: {},
      trumpBroken: false,
      leaderId: null,
      reveal: null,
      handPhase: 'idle',
      lastTrickSnapshot: null,
      sessionSeed: null,
    },
    display_order: {},
  } as AppState;
}

describe('roster selectors', () => {
  it('falls back to legacy players for scorecard mode when no rosters exist', () => {
    const s = makeBase();
    s.players = { p1: 'A', p2: 'B', p3: 'C' };
    s.display_order = { p2: 0, p1: 1 };
    const r = selectActiveRoster(s, 'scorecard');
    expect(r?.name).toBe('Score Card');
    expect(r?.playersById).toEqual(s.players);
    // dense order includes all players
    expect(Object.values(r!.displayOrder).sort()).toEqual([0, 1, 2]);
    const list = selectPlayersOrderedFor(s, 'scorecard');
    expect(list.map((x) => x.id)).toEqual(['p2', 'p1', 'p3']);
  });

  it('uses active roster when present', () => {
    const s = makeBase();
    s.rosters = {
      r1: {
        name: 'Score Card',
        playersById: { a: 'A', b: 'B' },
        displayOrder: { b: 0, a: 1 },
        type: 'scorecard',
        createdAt: 1,
      },
    } as any;
    s.activeScorecardRosterId = 'r1';
    const r = selectActiveRoster(s, 'scorecard');
    expect(r?.rosterId).toBe('r1');
    const list = selectPlayersOrderedFor(s, 'scorecard');
    expect(list.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('human id returns null by default and reads single mode when set', () => {
    const s = makeBase();
    expect(selectHumanIdFor(s, 'single')).toBeNull();
    s.humanByMode = { single: 'me' } as any;
    expect(selectHumanIdFor(s, 'single')).toBe('me');
    expect(selectHumanIdFor(s, 'scorecard')).toBeNull();
  });
});
