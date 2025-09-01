import { describe, it, expect } from 'vitest'
import { INITIAL_STATE, reduce } from '@/lib/state/types'
import { makeEvent } from '@/lib/state/events'
import { selectRoundInfosAll, selectCumulativeScoresAllRounds, selectNextActionableRound } from '@/lib/state/selectors'

const now = 1_700_000_000_000
const ev = (type: any, payload: any, id: string) => makeEvent(type, payload, { eventId: id, ts: now })

function replay(events: any[], base = INITIAL_STATE) {
  return events.reduce((s, e) => reduce(s, e), base)
}

describe('selectors extra branches', () => {
  it('round infos cover under/match/over', () => {
    let s = replay([
      ev('player/added', { id: 'p1', name: 'A' }, 'e1'),
      ev('player/added', { id: 'p2', name: 'B' }, 'e2'),
      // r1: bids sum < tricks (under)
      ev('bid/set', { round: 1, playerId: 'p1', bid: 1 }, 'e3'),
      // r2: bids sum == tricks (match) -> tricksForRound(2)=9
      ev('bid/set', { round: 2, playerId: 'p1', bid: 4 }, 'e4'),
      ev('bid/set', { round: 2, playerId: 'p2', bid: 5 }, 'e5'),
      // r3: bids sum > tricks (over) -> tricksForRound(3)=8
      ev('bid/set', { round: 3, playerId: 'p1', bid: 5 }, 'e6'),
      ev('bid/set', { round: 3, playerId: 'p2', bid: 4 }, 'e7'),
    ])
    const infos = selectRoundInfosAll(s)
    expect(infos[1]!.overUnder).toBe('under')
    expect(infos[2]!.overUnder).toBe('match')
    expect(infos[3]!.overUnder).toBe('over')
  })

  it('next actionable returns first non-scored if earlier incomplete exists', () => {
    // Make round 1 locked, round 2 bidding -> should return 2
    let s = replay([
      ev('player/added', { id: 'p', name: 'A' }, 'n1'),
      // mark r2 as bidding explicitly
      ev('round/state-set', { round: 2, state: 'bidding' }, 'n2'),
    ])
    // Implementation picks the first locked round after all previous are scored (r=1)
    expect(selectNextActionableRound(s)).toBe(1)
    // Now finalize 2 but leave 1 incomplete -> should return 1 (first non-scored)
    s = replay([
      ev('made/set', { round: 2, playerId: 'p', made: true }, 'n3'),
      ev('round/finalize', { round: 2 }, 'n4'),
    ], s)
    expect(selectNextActionableRound(s)).toBe(1)
  })

  it('cumulative scores by round through includes only scored totals per round', () => {
    // Two rounds: only r1 scored, r2 in progress
    let s = replay([
      ev('player/added', { id: 'p', name: 'A' }, 'c1'),
      ev('bid/set', { round: 1, playerId: 'p', bid: 2 }, 'c2'),
      ev('made/set', { round: 1, playerId: 'p', made: true }, 'c3'),
      ev('round/finalize', { round: 1 }, 'c4'),
      ev('bid/set', { round: 2, playerId: 'p', bid: 3 }, 'c5'),
    ])
    const byRound = selectCumulativeScoresAllRounds(s)
    // Round 1 contributes +7, later rounds not scored -> cumulative remains 7 across snapshots
    expect(byRound[1]?.p).toBe(7)
    expect(byRound[2]?.p).toBe(7)
  })
})
