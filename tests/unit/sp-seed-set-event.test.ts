import { describe, it, expect } from 'vitest';
import { createInstance } from '@/lib/state/instance';
import { events } from '@/lib/state/events';

describe('sp/seed-set event', () => {
  it('validates via zod and persists to state', async () => {
    const a = await createInstance({ dbName: `val-${Math.random()}` });
    const seed = 123456;
    await a.append(events.spSeedSet({ seed }));
    expect(a.getState().sp.sessionSeed).toBe(seed);
    a.close();
  });

  it('rejects non-integer seed via validation', async () => {
    const a = await createInstance({ dbName: `val-${Math.random()}` });
    await expect(a.append(events.spSeedSet({ seed: 123.9 as any }))).rejects.toMatchObject({
      name: 'InvalidEvent',
    });
    a.close();
  });
});
