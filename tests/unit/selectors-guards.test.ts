import { describe, it, expect } from 'vitest';
import { selectSpRotatedOrder, type AppState, INITIAL_STATE } from '@/lib/state';

describe('selectors guard against missing/incomplete sp', () => {
  it('selectSpRotatedOrder returns [] when state.sp is missing', () => {
    const s = {} as unknown as AppState; // simulate legacy/partial state
    const out = selectSpRotatedOrder(s);
    expect(out).toEqual([]);
  });

  it('selectSpRotatedOrder returns [] when order is not an array', () => {
    const s = { ...INITIAL_STATE, sp: { ...(INITIAL_STATE.sp as any), order: undefined } } as AppState;
    const out = selectSpRotatedOrder(s);
    expect(out).toEqual([]);
  });

  it('selectSpRotatedOrder returns order unchanged when no leader and no plays', () => {
    const s = {
      ...INITIAL_STATE,
      sp: {
        ...INITIAL_STATE.sp,
        order: ['p1', 'p2', 'p3'],
        leaderId: null,
        trickPlays: [],
      },
    } as AppState;
    const out = selectSpRotatedOrder(s);
    expect(out).toEqual(['p1', 'p2', 'p3']);
  });
});

