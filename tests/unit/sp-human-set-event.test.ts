import { describe, it, expect } from 'vitest';
import { createInstance } from '@/lib/state/instance';
import { events } from '@/lib/state/events';

describe('sp/human-set event', () => {
  it('sets the single-player human id when appended', async () => {
    const a = await createInstance({ dbName: `sp-human-${Math.random()}` });
    await a.append(events.spHumanSet({ id: 'human-player' }));
    expect(a.getState().humanByMode?.single).toBe('human-player');
    a.close();
  });

  it('rejects invalid payload during validation', async () => {
    const a = await createInstance({ dbName: `sp-human-invalid-${Math.random()}` });
    await expect(a.append(events.spHumanSet({ id: '' as any }))).rejects.toMatchObject({
      name: 'InvalidEvent',
    });
    a.close();
  });
});
