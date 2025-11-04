import { describe, it, expect } from 'vitest';
import { createInstance } from '@/lib/state/instance';
import { events } from '@/lib/state/events';
import { getCurrentSinglePlayerGameId } from '@/lib/state/utils';

describe('sp/seed-set event', () => {
  it('validates via zod and persists to state', async () => {
    const a = await createInstance({ dbName: `val-${Math.random()}` });
    const seed = 123456;
    await a.append(events.spSeedSet({ seed }));
    const state = a.getState();
    expect(state.sp.sessionSeed).toBe(seed);
    const currentId = state.sp.currentGameId;
    expect(currentId).toBeTruthy();
    expect(currentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(state.sp.gameId).toBe(currentId);
    expect(getCurrentSinglePlayerGameId(state)).toBe(currentId);
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
