import { describe, it, expect } from 'vitest';
import { initInstance, makeTestDB, drain } from '@/tests/utils/helpers';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(type: T, payload: EventPayloadByType<T>, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

describe('drop → resume across rounds; finalize ignores absent', () => {
  it('allows finalizing rounds without inputs from absent players; resumes participation later', async () => {
    const dbName = makeTestDB('drf');
    const a = await initInstance(dbName);
    // Seed players
    await a.append(ev('player/added', { id: 'p1', name: 'A' }, 'drf-1'));
    await a.append(ev('player/added', { id: 'p2', name: 'B' }, 'drf-2'));
    // Round 1: bids and made for both; finalize
    await a.append(ev('bid/set', { round: 1, playerId: 'p1', bid: 1 }, 'drf-3'));
    await a.append(ev('bid/set', { round: 1, playerId: 'p2', bid: 0 }, 'drf-4'));
    await a.append(ev('made/set', { round: 1, playerId: 'p1', made: true }, 'drf-5'));
    await a.append(ev('made/set', { round: 1, playerId: 'p2', made: false }, 'drf-6'));
    await a.append(ev('round/finalize', { round: 1 }, 'drf-7'));
    expect(a.getState().rounds[1].state).toBe('scored');

    // Drop p2 from round 2 onward
    await a.append(ev('player/dropped', { id: 'p2', fromRound: 2 }, 'drf-8'));
    expect(a.getState().rounds[2].present?.p2).toBe(false);

    // Round 2: set bid and made for p1 only; finalize should ignore p2
    await a.append(ev('bid/set', { round: 2, playerId: 'p1', bid: 2 }, 'drf-9'));
    await a.append(ev('made/set', { round: 2, playerId: 'p1', made: false }, 'drf-10'));
    await a.append(ev('round/finalize', { round: 2 }, 'drf-11'));
    expect(a.getState().rounds[2].state).toBe('scored');

    // Resume p2 from round 3
    await a.append(ev('player/resumed', { id: 'p2', fromRound: 3 }, 'drf-12'));
    expect(a.getState().rounds[3].present?.p2).toBe(true);

    // Round 3: bids/made for both again; finalize
    await a.append(ev('bid/set', { round: 3, playerId: 'p1', bid: 0 }, 'drf-13'));
    await a.append(ev('bid/set', { round: 3, playerId: 'p2', bid: 1 }, 'drf-14'));
    await a.append(ev('made/set', { round: 3, playerId: 'p1', made: true }, 'drf-15'));
    await a.append(ev('made/set', { round: 3, playerId: 'p2', made: false }, 'drf-16'));
    await a.append(ev('round/finalize', { round: 3 }, 'drf-17'));
    expect(a.getState().rounds[3].state).toBe('scored');

    a.close();
  });
});
