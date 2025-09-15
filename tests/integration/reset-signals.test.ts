import { describe, it, expect } from 'vitest';
import { initInstance, makeTestDB, drain } from '@/tests/utils/helpers';
import { makeEvent, type AppEventType, type EventPayloadByType } from '@/lib/state/events';

const now = 1_700_000_000_000;
const ev = <T extends AppEventType>(type: T, payload: EventPayloadByType<T>, id: string) =>
  makeEvent(type, payload, { eventId: id, ts: now });

describe('reset signals', () => {
  it('handles BroadcastChannel reset message by reloading DB state', async () => {
    const dbName = makeTestDB('reset-bc');
    const channelName = `chan-${dbName}`;
    const a = await initInstance(dbName, channelName, true);
    await a.append(ev('player/added', { id: 'p1', name: 'A' }, 'rb1'));
    const beforeH = a.getHeight();
    const beforeState = a.getState();

    const bc = new BroadcastChannel(channelName);
    bc.postMessage({ type: 'reset' });
    // allow queued catch-up to run
    await drain();
    bc.close();

    expect(a.getHeight()).toBe(beforeH);
    const strip = (s: any) => ({
      players: s.players,
      scores: s.scores,
      rounds: s.rounds,
      display_order: s.display_order,
      sp: s.sp,
    });
    expect(strip(a.getState())).toEqual(strip(beforeState));
    a.close();
  });

  it('handles localStorage reset signal when channel disabled', async () => {
    const dbName = makeTestDB('reset-ls');
    const channelName = `chan-${dbName}`;
    const a = await initInstance(dbName, channelName, false);
    await a.append(ev('player/added', { id: 'p1', name: 'A' }, 'rl1'));
    const beforeH = a.getHeight();
    const beforeState = a.getState();

    const key = `app-events:signal:${dbName}`;
    // setItem and dispatch a StorageEvent to trigger listener branch
    localStorage.setItem(key, 'reset');
    try {
      // @ts-expect-error - StorageEvent may not be fully typed in Node
      const evnt = new StorageEvent('storage', {
        key,
        newValue: 'reset',
        storageArea: localStorage,
      });
      dispatchEvent(evnt);
    } catch {}
    await drain();

    expect(a.getHeight()).toBe(beforeH);
    const strip = (s: any) => ({
      players: s.players,
      scores: s.scores,
      rounds: s.rounds,
      display_order: s.display_order,
      sp: s.sp,
    });
    expect(strip(a.getState())).toEqual(strip(beforeState));
    a.close();
  });
});
