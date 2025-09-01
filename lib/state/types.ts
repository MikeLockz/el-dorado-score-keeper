export type UUID = string

export type AppEvent<T = any> = {
  eventId: UUID
  type: string
  payload: T
  ts: number
}

export type RoundState = 'locked' | 'bidding' | 'complete' | 'scored'

export type RoundData = Readonly<{
  state: RoundState
  bids: Record<string, number>
  made: Record<string, boolean | null>
}>

export type AppState = Readonly<{
  players: Record<string, string>
  scores: Record<string, number>
  rounds: Record<number, RoundData>
}>

const ROUNDS_TOTAL = 10

function initialRounds(): Record<number, RoundData> {
  const rounds: Record<number, RoundData> = {}
  for (let i = 1; i <= ROUNDS_TOTAL; i++) {
    rounds[i] = { state: i === 1 ? 'bidding' : 'locked', bids: {}, made: {} }
  }
  return rounds
}

export const INITIAL_STATE: AppState = {
  players: {},
  scores: {},
  rounds: initialRounds(),
} as const

function tricksForRound(roundNo: number): number {
  return Math.max(0, Math.min(10, 11 - roundNo))
}

export function reduce(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case 'player/added': {
      const { id, name } = event.payload as { id: string; name: string }
      if (state.players[id]) return state
      return { ...state, players: { ...state.players, [id]: name } }
    }
    case 'player/renamed': {
      const { id, name } = event.payload as { id: string; name: string }
      if (!state.players[id]) return state
      return { ...state, players: { ...state.players, [id]: String(name) } }
    }
    case 'player/removed': {
      const { id } = event.payload as { id: string }
      if (!state.players[id]) return state
      const { [id]: _, ...restPlayers } = state.players as any
      const { [id]: __, ...restScores } = state.scores as any
      const rounds: Record<number, RoundData> = {}
      for (const [k, r] of Object.entries(state.rounds)) {
        const { [id]: _b, ...bids } = (r.bids as any) ?? {}
        const { [id]: _m, ...made } = (r.made as any) ?? {}
        rounds[Number(k)] = { ...r, bids, made }
      }
      return { ...state, players: restPlayers, scores: restScores, rounds }
    }
    case 'score/added': {
      const { playerId, delta } = event.payload as { playerId: string; delta: number }
      const next = (state.scores[playerId] ?? 0) + delta
      return { ...state, scores: { ...state.scores, [playerId]: next } }
    }
    case 'round/state-set': {
      const { round, state: rState } = event.payload as { round: number; state: RoundState }
      const r = state.rounds[round] ?? { state: 'locked', bids: {}, made: {} }
      return { ...state, rounds: { ...state.rounds, [round]: { ...r, state: rState } } }
    }
    case 'bid/set': {
      const { round, playerId, bid } = event.payload as { round: number; playerId: string; bid: number }
      const r = state.rounds[round] ?? { state: 'locked', bids: {}, made: {} }
      const max = tricksForRound(round)
      const clamped = Math.max(0, Math.min(max, Math.floor(bid)))
      return { ...state, rounds: { ...state.rounds, [round]: { ...r, bids: { ...r.bids, [playerId]: clamped } } } }
    }
    case 'made/set': {
      const { round, playerId, made } = event.payload as { round: number; playerId: string; made: boolean }
      const r = state.rounds[round] ?? { state: 'locked', bids: {}, made: {} }
      return { ...state, rounds: { ...state.rounds, [round]: { ...r, made: { ...r.made, [playerId]: !!made } } } }
    }
    case 'round/finalize': {
      const { round } = event.payload as { round: number }
      const r = state.rounds[round] ?? { state: 'locked', bids: {}, made: {} }
      let scores = { ...state.scores }
      for (const pid of Object.keys(state.players)) {
        const bid = r.bids[pid] ?? 0
        const made = r.made[pid] ?? false
        const delta = (made ? 1 : -1) * (5 + bid)
        scores[pid] = (scores[pid] ?? 0) + delta
      }
      const rounds = { ...state.rounds, [round]: { ...r, state: 'scored' as RoundState } }
      const nextRound = round + 1
      if (rounds[nextRound] && rounds[nextRound].state === 'locked') {
        rounds[nextRound] = { ...rounds[nextRound], state: 'bidding' }
      }
      return { ...state, scores, rounds }
    }
    default:
      return state
  }
}
