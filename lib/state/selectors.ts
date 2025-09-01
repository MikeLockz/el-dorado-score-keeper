import type { AppState, RoundData } from './types'
import { roundDelta } from './logic'

// Simple memo helpers keyed by object identity and primitive args.
function memo1<A extends object, R>(fn: (a: A) => R) {
  let lastA: A | null = null
  let lastR: R | null = null
  return (a: A): R => {
    if (lastA === a && lastR !== null) return lastR as R
    const r = fn(a)
    lastA = a
    lastR = r
    return r
  }
}

function memo2<A1 extends object, A2 extends number | string, R>(fn: (a1: A1, a2: A2) => R) {
  let lastA1: A1 | null = null
  let lastA2: A2 | null = null
  let lastR: R | null = null
  return (a1: A1, a2: A2): R => {
    if (lastA1 === a1 && lastA2 === a2 && lastR !== null) return lastR as R
    const r = fn(a1, a2)
    lastA1 = a1
    lastA2 = a2
    lastR = r
    return r
  }
}

export type Leader = { id: string; name: string; score: number }

// Scores are already stored; expose identity-stable access and leaders list.
export const selectScores = memo1((s: AppState) => s.scores)

export const selectLeaders = memo1((s: AppState): Leader[] => {
  const leaders: Leader[] = Object.keys(s.players).map((id) => ({
    id,
    name: s.players[id],
    score: s.scores[id] ?? 0,
  }))
  leaders.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return leaders
})

export type RoundRow = { id: string; name: string; bid: number; made: boolean | null; delta: number }
export type RoundSummary = { round: number; state: RoundData['state']; rows: RoundRow[] }

export const selectRoundSummary = memo2((s: AppState, round: number): RoundSummary => {
  const r: RoundData | undefined = s.rounds[round]
  const rows: RoundRow[] = Object.keys(s.players).map((id) => {
    const bid = r?.bids[id] ?? 0
    const made = (r?.made[id] ?? null) as boolean | null
    const delta = roundDelta(bid, made)
    return { id, name: s.players[id], bid, made, delta }
  })
  return { round, state: r?.state ?? 'locked', rows }
})
