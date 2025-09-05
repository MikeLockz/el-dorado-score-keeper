import { describe, it, expect } from 'vitest';
import { createInstance } from '@/lib/state/instance';

describe('event validation: invalid base shape', () => {
  it('rejects when required base fields are missing', async () => {
    const warns: Array<{ c: string; i?: unknown }> = [];
    const a = await createInstance({
      dbName: `val-shape-${Math.random()}`,
      onWarn: (c, i) => warns.push({ c, i }),
    });

    // Missing eventId and ts; wrong payload type entirely
    const bad: any = { type: 'player/added', payload: null };
    await expect(a.append(bad)).rejects.toMatchObject({ name: 'InvalidEvent' });
    expect(warns.find((w) => w.c === 'append.invalid_event_shape')).toBeTruthy();
    a.close();
  });
});
