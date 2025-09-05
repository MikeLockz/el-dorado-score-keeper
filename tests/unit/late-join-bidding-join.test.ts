import { describe, it, expect } from 'vitest';
import { makeEvent } from '@/lib/state/events';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';
import { validateEventStrict } from '@/lib/state/validation';

const now = 1_700_000_000_000;
const ev = (type: any, payload: any) => makeEvent(type as any, payload as any, { ts: now, eventId: `${type}-${JSON.stringify(payload)}` });

describe('late join when a round is in bidding', () => {
  it('newly added player is present for the active bidding round', () => {
    let s: AppState = INITIAL_STATE;
    // Round 1 starts as bidding by default; add first player
    s = reduce(s, validateEventStrict(ev('player/added', { id: 'p1', name: 'A' })));
    // Add a late player while round 1 is still in bidding
    s = reduce(s, validateEventStrict(ev('player/added', { id: 'p2', name: 'B' })));
    expect(s.rounds[1].state).toBe('bidding');
    expect(s.rounds[1].present?.p2).toBe(true);
  });
});

