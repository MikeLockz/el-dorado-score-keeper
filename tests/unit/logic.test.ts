import { describe, it, expect } from 'vitest'
import { clampBid, roundDelta, finalizeRound, initialRounds } from '@/lib/state/logic'
import type { AppState } from '@/lib/state/types'

describe('logic: clampBid', () => {
  it('clamps to [0..max] per round and floors', () => {
    // Round 1 max=10
    expect(clampBid(1, 50)).toBe(10)
    expect(clampBid(1, -3)).toBe(0)
    expect(clampBid(1, 4.7)).toBe(4)
    // Round 5 max=6
    expect(clampBid(5, 9)).toBe(6)
    expect(clampBid(5, 5.9)).toBe(5)
    // Round 10 max=1
    expect(clampBid(10, 2)).toBe(1)
    expect(clampBid(10, 0.9)).toBe(0)
  })
})

describe('logic: roundDelta', () => {
  it('returns 0 when made is null/undefined', () => {
    expect(roundDelta(3, null)).toBe(0)
    expect(roundDelta(3, undefined)).toBe(0)
  })
  it('computes ±(5 + floor(bid)) based on made', () => {
    expect(roundDelta(2, true)).toBe(7)
    expect(roundDelta(2, false)).toBe(-7)
    expect(roundDelta(2.9, true)).toBe(7)
    // Negative bids are floored in base, though UI clamps before this point
    expect(roundDelta(-1, true)).toBe(4)
  })
})

describe('logic: finalizeRound', () => {
  it('applies deltas to scores, marks round scored, and unlocks next round', () => {
    const base: AppState = {
      players: { p1: 'A', p2: 'B' },
      scores: { p1: 3, p2: -2 },
      rounds: initialRounds(),
    }
    // Prepare round 1 with bids/made
    const withRound: AppState = {
      ...base,
      rounds: {
        ...base.rounds,
        1: { state: 'complete', bids: { p1: 2, p2: 1 }, made: { p1: true, p2: false } },
      },
    }
    const after = finalizeRound(withRound, 1)
    // p1 +7 => 10, p2 -6 => -8
    expect(after.scores.p1).toBe(10)
    expect(after.scores.p2).toBe(-8)
    expect(after.rounds[1].state).toBe('scored')
    // next round was locked; should now be bidding
    expect(after.rounds[2].state).toBe('bidding')
  })
})

