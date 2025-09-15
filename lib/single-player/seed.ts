// Deterministic seed derivation from a session base.
// Produces a 32-bit unsigned integer suitable for mulberry32, etc.
export function deriveSeed(base: number, round: number, stream = 0): number {
  // Ensure integers
  let x = (Math.floor(base) >>> 0) ^ (((Math.floor(round) + 1) * 0x9e3779b9) >>> 0);
  x = (x ^ (((Math.floor(stream) + 1) * 0x85ebca6b) >>> 0)) >>> 0;
  // Finalize/mix (inspired by splitmix32-like avalanching)
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}
