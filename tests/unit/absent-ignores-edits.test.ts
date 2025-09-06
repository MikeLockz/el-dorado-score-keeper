import { describe, it, expect } from 'vitest';
import { makeEvent } from '@/lib/state/events';
import { INITIAL_STATE, reduce, type AppState } from '@/lib/state/types';
import { validateEventStrict } from '@/lib/state/validation';

const now = 1_700_000_000_000;
const ev = (type: any, payload: any) =>
  makeEvent(type as any, payload as any, {
    ts: now,
    eventId: `${type}-${JSON.stringify(payload)}`,
  });

describe('absent players ignore bid/set and made/set', () => {
  it('bid and made events are ignored when present=false', () => {
    let s: AppState = INITIAL_STATE;
    // Add two players
    s = reduce(s, validateEventStrict(ev('player/added', { id: 'p1', name: 'A' })));
    s = reduce(s, validateEventStrict(ev('player/added', { id: 'p2', name: 'B' })));
    // Drop p2 from round 1 onward (present=false at r>=1)
    s = reduce(s, validateEventStrict(ev('player/dropped', { id: 'p2', fromRound: 1 })));
    expect(s.rounds[1].present?.p2).toBe(false);
    // Attempt to set bid/made for absent p2 in round 1
    const s1 = reduce(s, validateEventStrict(ev('bid/set', { round: 1, playerId: 'p2', bid: 3 })));
    const s2 = reduce(
      s1,
      validateEventStrict(ev('made/set', { round: 1, playerId: 'p2', made: true })),
    );
    expect(s2.rounds[1].bids.p2).toBeUndefined();
    expect(s2.rounds[1].made.p2).toBeUndefined();
  });
});
