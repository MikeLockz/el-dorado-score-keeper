import { describe, it, expect } from 'vitest';
import { createInstance } from '@/lib/state/instance';
import { events } from '@/lib/state/events';
import { archiveCurrentGameAndReset, getGame, GAMES_DB_NAME } from '@/lib/state/io';

function makeDbName(prefix = 'arch-sp') {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

describe('archive SP snapshot metadata', () => {
  it('includes state.sp fields in summary', async () => {
    const dbName = makeDbName();
    const inst = await createInstance({ dbName, channelName: `chan-${dbName}` });
    await inst.append(events.playerAdded({ id: 'p1', name: 'A' }));
    await inst.append(events.playerAdded({ id: 'p2', name: 'B' }));
    await inst.append(
      events.spDeal({
        roundNo: 3,
        dealerId: 'p2',
        order: ['p2', 'p1'],
        trump: 'hearts',
        trumpCard: { suit: 'hearts', rank: 12 },
        hands: { p1: [], p2: [] },
      }),
    );
    await inst.append(events.spLeaderSet({ leaderId: 'p2' }));
    await inst.append(events.spPhaseSet({ phase: 'bidding' }));

    const rec = await archiveCurrentGameAndReset(dbName, { title: 'SP Snapshot' });
    expect(rec).not.toBeNull();
    const got = await getGame(GAMES_DB_NAME, rec!.id);
    expect(got?.summary.sp?.roundNo).toBe(3);
    expect(got?.summary.sp?.phase).toBe('bidding');
    expect(got?.summary.sp?.dealerId).toBe('p2');
    expect(got?.summary.sp?.leaderId).toBe('p2');
    expect(got?.summary.sp?.trump).toBe('hearts');
    expect(got?.summary.sp?.trumpCard).toEqual({ suit: 'hearts', rank: 12 });

    inst.close();
  });
});
