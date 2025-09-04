import { describe, it, expect } from 'vitest';
import { tricksForRound } from '@/lib/state/logic';

describe('tricksForRound beyond normal range', () => {
  it('clamps output to [0..10]', () => {
    for (const r of [-100, -1, 0, 1, 5, 10, 11, 100]) {
      const t = tricksForRound(r as number);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(10);
    }
  });

  it('returns 10 for non-positive rounds (<= 0)', () => {
    expect(tricksForRound(0)).toBe(10);
    expect(tricksForRound(-1)).toBe(10);
    expect(tricksForRound(-5)).toBe(10);
  });

  it('returns 0 for rounds >= 11', () => {
    expect(tricksForRound(11)).toBe(0);
    expect(tricksForRound(50)).toBe(0);
  });

  it('floors fractional rounds before mapping', () => {
    expect(tricksForRound(1.9)).toBe(10); // floor(1.9)=1 -> 10
    expect(tricksForRound(10.9)).toBe(1); // floor(10.9)=10 -> 1
  });
});

