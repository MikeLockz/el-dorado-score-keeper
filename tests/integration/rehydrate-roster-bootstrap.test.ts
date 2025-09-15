import { describe, it, expect, beforeEach } from 'vitest';
import { initInstance, makeTestDB } from '@/tests/utils/helpers';
import { makeEvent } from '@/lib/state/events';

const now = 1_700_000_000_000;

describe('rehydrate bootstrap: roster model', () => {
  beforeEach(() => {
    (globalThis as any).__DB_NAME__ = makeTestDB('rb');
  });

  it('creates a default scorecard roster from legacy players when none exist', async () => {
    const dbName = (globalThis as any).__DB_NAME__;
    const a = await initInstance(dbName);
    // Seed legacy players
    await a.append(makeEvent('player/added', { id: 'p1', name: 'Alice' }, { ts: now }));
    await a.append(makeEvent('player/added', { id: 'p2', name: 'Bob' }, { ts: now + 1 }));
    a.close();

    // Re-open to trigger rehydrate path (bootstrap runs there)
    const b = await initInstance(dbName);
    const s = b.getState();
    expect(Object.keys(s.players)).toEqual(['p1', 'p2']);
    // Roster is bootstrapped
    expect(s.activeScorecardRosterId).not.toBeNull();
    const rid = s.activeScorecardRosterId!;
    expect(s.rosters[rid]).toBeTruthy();
    expect(s.rosters[rid].type).toBe('scorecard');
    expect(s.rosters[rid].playersById).toEqual({ p1: 'Alice', p2: 'Bob' });
    // Display order contains both ids with dense indices
    const order = s.rosters[rid].displayOrder;
    const idxs = Object.values(order).sort((x, y) => x - y);
    expect(idxs).toEqual([0, 1]);
    b.close();
  });

  it('keeps roster keys empty when there are no legacy players', async () => {
    const dbName = makeTestDB('rb-empty');
    const a = await initInstance(dbName);
    const s = a.getState();
    expect(Object.keys(s.players).length).toBe(0);
    expect(Object.keys(s.rosters).length).toBe(0);
    expect(s.activeScorecardRosterId).toBeNull();
    expect(s.activeSingleRosterId).toBeNull();
    a.close();
  });
});
