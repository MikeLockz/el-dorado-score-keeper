import { describe, it, expect } from 'vitest';
import { makeEvent } from '@/lib/state/events';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';
import { validateEventStrict } from '@/lib/state/validation';

const now = 1_700_000_000_000;
const ev = (type: any, payload: any) => makeEvent(type as any, payload as any, { ts: now, eventId: `${type}-${JSON.stringify(payload)}` });

describe('late join join-index behavior', () => {
  it('marks new player absent for previously scored rounds even if toggled back', () => {
    // Setup: two players, finalize round 1
    let s: AppState = INITIAL_STATE;
    for (const e of [
      validateEventStrict(ev('player/added', { id: 'p1', name: 'A' })),
      validateEventStrict(ev('player/added', { id: 'p2', name: 'B' })),
      validateEventStrict(ev('bid/set', { round: 1, playerId: 'p1', bid: 1 })),
      validateEventStrict(ev('bid/set', { round: 1, playerId: 'p2', bid: 0 })),
      validateEventStrict(ev('made/set', { round: 1, playerId: 'p1', made: true })),
      validateEventStrict(ev('made/set', { round: 1, playerId: 'p2', made: false })),
      validateEventStrict(ev('round/finalize', { round: 1 })),
    ]) s = reduce(s, e);

    expect(s.rounds[1].state).toBe('scored');

    // Toggle round 1 back to complete (simulate a correction state before re-scoring)
    s = reduce(s, validateEventStrict(ev('round/state-set', { round: 1, state: 'complete' })));
    expect(s.rounds[1].state).toBe('complete');

    // Add new player p3; joinIndex should be maxScored+1 = 2, so p3 absent in round 1
    s = reduce(s, validateEventStrict(ev('player/added', { id: 'p3', name: 'C' })));
    expect(s.rounds[1].present?.p3).toBe(false);
    expect(s.rounds[2].present?.p3).toBe(true);

    // Move round 1 to complete and finalize; should not require p3 to be marked
    s = reduce(s, validateEventStrict(ev('round/state-set', { round: 1, state: 'complete' })));
    // Finalize again
    s = reduce(s, validateEventStrict(ev('round/finalize', { round: 1 })));
    expect(s.rounds[1].state).toBe('scored');
  });
});
