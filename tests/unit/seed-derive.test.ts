import { describe, it, expect } from 'vitest';
import { deriveSeed } from '@/lib/single-player';

describe('deriveSeed', () => {
  it('is deterministic for same inputs', () => {
    const a = deriveSeed(123456, 1, 0);
    const b = deriveSeed(123456, 1, 0);
    expect(a).toBe(b);
  });

  it('produces 32-bit unsigned integers', () => {
    const samples = [
      deriveSeed(0, 0, 0),
      deriveSeed(1, 1, 1),
      deriveSeed(0x7fffffff, 10, 2),
      deriveSeed(0xffffffff, 100, 3),
    ];
    for (const s of samples) {
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2 ** 32);
    }
  });

  it('differs across round and stream for typical cases', () => {
    const base = 42_4242;
    const r0s0 = deriveSeed(base, 1, 0);
    const r1s0 = deriveSeed(base, 2, 0);
    const r0s1 = deriveSeed(base, 1, 1);
    // Not a mathematical proof, but extremely likely to differ
    expect(r0s0).not.toBe(r1s0);
    expect(r0s0).not.toBe(r0s1);
  });
});
