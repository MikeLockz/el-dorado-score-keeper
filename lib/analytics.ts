import type { GameRecord } from '@/lib/state/io'
import { INITIAL_STATE, reduce } from '@/lib/state/types'
import { ROUNDS_TOTAL, tricksForRound } from '@/lib/state/logic'

export type PlayerAgg = {
  playerId: string
  name: string
  totalBid: number
  highestSingleBid: { round: number; bid: number } | null
  handsWon: number
  handsLost: number
  biggestSingleLoss: { round: number; loss: number; bid: number } | null
}

export type RoundAgg = {
  round: number
  tricks: number
  sumBids: number
  overUnder: 'over' | 'under' | 'exact'
}

export type GameTiming = {
  startedAt: number
  finishedAt: number
  durationMs: number
}

export type GameStats = {
  players: PlayerAgg[]
  rounds: RoundAgg[]
  totals: {
    totalPointsBid: number
    totalHandsWon: number
    totalHandsLost: number
  }
  leaders: {
    mostTotalBid: PlayerAgg | null
    leastTotalBid: PlayerAgg | null
    highestSingleBid: { playerId: string; name: string; round: number; bid: number } | null
    biggestSingleLoss: { playerId: string; name: string; round: number; loss: number; bid: number } | null
  }
  timing: GameTiming
}

export function analyzeGame(rec: GameRecord): GameStats {
  // Reconstruct final state from events
  let state = INITIAL_STATE
  for (const e of rec.bundle.events) state = reduce(state, e)

  const pids = Object.keys(state.players)
  const players: Record<string, PlayerAgg> = {}
  for (const pid of pids) {
    players[pid] = {
      playerId: pid,
      name: rec.summary.playersById[pid] ?? state.players[pid] ?? pid,
      totalBid: 0,
      highestSingleBid: null,
      handsWon: 0,
      handsLost: 0,
      biggestSingleLoss: null,
    }
  }

  const rounds: RoundAgg[] = []
  let totalPointsBid = 0
  let totalHandsWon = 0
  let totalHandsLost = 0

  for (let r = 1; r <= ROUNDS_TOTAL; r++) {
    const rd = state.rounds[r]
    if (!rd) continue
    const tricks = tricksForRound(r)
    let sumBids = 0
    for (const pid of pids) {
      const bid = rd.bids[pid] ?? 0
      const made = rd.made[pid]
      sumBids += bid
      const p = players[pid]
      p.totalBid += bid
      if (
        !p.highestSingleBid ||
        bid > p.highestSingleBid.bid ||
        (bid === p.highestSingleBid.bid && r < p.highestSingleBid.round)
      ) {
        p.highestSingleBid = { round: r, bid }
      }
      if (made === true) { p.handsWon++; totalHandsWon++ }
      else if (made === false) {
        p.handsLost++; totalHandsLost++
        const loss = 5 + bid
        if (!p.biggestSingleLoss || loss > p.biggestSingleLoss.loss) {
          p.biggestSingleLoss = { round: r, loss, bid }
        }
      }
    }
    totalPointsBid += sumBids
    const overUnder: RoundAgg['overUnder'] = sumBids > tricks ? 'over' : sumBids < tricks ? 'under' : 'exact'
    rounds.push({ round: r, tricks, sumBids, overUnder })
  }

  const playerAggs = Object.values(players)
  const mostTotalBid = playerAggs.length
    ? playerAggs.reduce((a, b) => (a.totalBid >= b.totalBid ? a : b))
    : null
  const leastTotalBid = playerAggs.length
    ? playerAggs.reduce((a, b) => (a.totalBid <= b.totalBid ? a : b))
    : null
  const highestSingleBid = playerAggs.reduce<{
    playerId: string; name: string; round: number; bid: number
  } | null>((acc, p) => {
    if (!p.highestSingleBid) return acc
    const cur = { playerId: p.playerId, name: p.name, ...p.highestSingleBid }
    if (!acc) return cur
    if (cur.bid > acc.bid || (cur.bid === acc.bid && cur.round < acc.round)) return cur
    return acc
  }, null)
  const biggestSingleLoss = playerAggs.reduce<{
    playerId: string; name: string; round: number; loss: number; bid: number
  } | null>((acc, p) => {
    if (!p.biggestSingleLoss) return acc
    const cur = { playerId: p.playerId, name: p.name, ...p.biggestSingleLoss }
    if (!acc) return cur
    if (cur.loss > acc.loss || (cur.loss === acc.loss && cur.round < acc.round)) return cur
    return acc
  }, null)

  const startedAt = rec.bundle.events.length ? Number((rec.bundle.events[0] as any).ts) : rec.createdAt
  const finishedAt = rec.finishedAt
  return {
    players: playerAggs,
    rounds,
    totals: { totalPointsBid, totalHandsWon, totalHandsLost },
    leaders: { mostTotalBid, leastTotalBid, highestSingleBid, biggestSingleLoss },
    timing: { startedAt, finishedAt, durationMs: Math.max(0, finishedAt - startedAt) },
  }
}

