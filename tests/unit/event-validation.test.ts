import { describe, it, expect } from 'vitest';
import { createInstance } from '@/lib/state/instance';
import { events } from '@/lib/state/events';

describe('event validation on append', () => {
  it('rejects invalid payload with warn', async () => {
    const warns: any[] = [];
    const a = await createInstance({
      dbName: `val-${Math.random()}`,
      onWarn: (c, i) => warns.push({ c, i }),
    });
    const bad: any = {
      type: 'player/added',
      payload: { id: '' /* empty id */, name: '' },
      eventId: 'x',
      ts: Date.now(),
    };
    await expect(a.append(bad)).rejects.toMatchObject({ name: 'InvalidEvent' });
    expect(warns.find((w) => w.c === 'append.invalid_payload')).toBeTruthy();
    a.close();
  });

  it('rejects unknown event type with warn', async () => {
    const warns: any[] = [];
    const a = await createInstance({
      dbName: `val-${Math.random()}`,
      onWarn: (c, i) => warns.push({ c, i }),
    });
    const bad: any = { type: 'custom/unknown', payload: { any: 1 }, eventId: 'x', ts: Date.now() };
    await expect(a.append(bad)).rejects.toMatchObject({ name: 'InvalidEvent' });
    expect(warns.find((w) => w.c === 'append.unknown_event_type')).toBeTruthy();
    a.close();
  });

  it('accepts valid event', async () => {
    const a = await createInstance({ dbName: `val-${Math.random()}` });
    await a.append(events.playerAdded({ id: 'p1', name: 'Alice' }));
    expect(a.getState().players.p1).toBe('Alice');
    a.close();
  });
});
