export type UUID = string

export type AppEvent<T = any> = {
  eventId: UUID
  type: string
  payload: T
  ts: number
}

export type AppState = Readonly<{
  players: Record<string, string>
  scores: Record<string, number>
}>

export const INITIAL_STATE: AppState = {
  players: {},
  scores: {},
} as const

export function reduce(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case 'player/added': {
      const { id, name } = event.payload as { id: string; name: string }
      if (state.players[id]) return state
      return {
        players: { ...state.players, [id]: name },
        scores: state.scores,
      }
    }
    case 'score/added': {
      const { playerId, delta } = event.payload as { playerId: string; delta: number }
      const next = (state.scores[playerId] ?? 0) + delta
      return {
        players: state.players,
        scores: { ...state.scores, [playerId]: next },
      }
    }
    default:
      return state
  }
}

