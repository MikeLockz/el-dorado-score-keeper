export type UUID = string;

// Event catalog mapping type -> payload shape
export type EventMap = {
	  'player/added': { id: string; name: string };
	  'player/renamed': { id: string; name: string };
	  'player/removed': { id: string };
	  'player/dropped': { id: string; fromRound: number };
	  'player/resumed': { id: string; fromRound: number };
	  'score/added': { playerId: string; delta: number };
	  'round/state-set': { round: number; state: RoundState };
	  'bid/set': { round: number; playerId: string; bid: number };
	  'made/set': { round: number; playerId: string; made: boolean };
	  'round/finalize': { round: number };
	};

export type AppEventType = keyof EventMap;
export type EventPayloadByType<T extends AppEventType> = EventMap[T];

// Strongly-typed known events (discriminated union)
export type KnownAppEvent = {
  [K in AppEventType]: {
    eventId: UUID;
    type: K;
    payload: EventMap[K];
    ts: number;
  };
}[AppEventType];

// Backward-compatible input event type (accept unknown custom events too)
export type AppEvent =
  | KnownAppEvent
  | { eventId: UUID; type: string; payload: unknown; ts: number };

export type RoundState = 'locked' | 'bidding' | 'complete' | 'scored';

export type RoundData = Readonly<{
	  state: RoundState;
	  bids: Record<string, number>;
	  made: Record<string, boolean | null>;
	  // If present[pid] === false, player is absent for the round. Missing implies present.
	  present?: Record<string, boolean>;
	}>;

export type AppState = Readonly<{
  players: Record<string, string>;
  scores: Record<string, number>;
  rounds: Record<number, RoundData>;
}>;
import { initialRounds, clampBid, finalizeRound } from './logic';

export const INITIAL_STATE: AppState = {
  players: {},
  scores: {},
  rounds: initialRounds(),
} as const;

export function reduce(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case 'player/added': {
      const { id, name } = event.payload as EventMap['player/added'];
      if (state.players[id]) return state;
      const rounds: Record<number, RoundData> = {};
      for (const [k, r] of Object.entries(state.rounds)) {
        const present = { ...(r.present ?? {}) } as Record<string, boolean>;
        present[id] = r.state === 'scored' ? false : true;
        rounds[Number(k)] = { ...r, present } as RoundData;
      }
      return { ...state, players: { ...state.players, [id]: name }, rounds };
    }
    case 'player/renamed': {
      const { id, name } = event.payload as EventMap['player/renamed'];
      if (!state.players[id]) return state;
      return { ...state, players: { ...state.players, [id]: String(name) } };
    }
    case 'player/removed': {
      const { id } = event.payload as EventMap['player/removed'];
      if (!state.players[id]) return state;
      const restPlayers: Record<string, string> = { ...state.players };
      delete restPlayers[id];
      const restScores: Record<string, number> = { ...state.scores };
      delete restScores[id];
      const rounds: Record<number, RoundData> = {};
      for (const [k, r] of Object.entries(state.rounds)) {
        const bids: Record<string, number> = { ...r.bids };
        delete bids[id];
        const made: Record<string, boolean | null> = { ...r.made };
        delete made[id];
        const present = { ...(r.present ?? {}) } as Record<string, boolean>;
        delete present[id];
        rounds[Number(k)] = { ...r, bids, made, present } as RoundData;
      }
      return { ...state, players: restPlayers, scores: restScores, rounds };
    }
    case 'player/dropped': {
      const { id, fromRound } = event.payload as EventMap['player/dropped'];
      if (!state.players[id]) return state;
      const rounds: Record<number, RoundData> = {};
      for (const [k, r] of Object.entries(state.rounds)) {
        const roundNo = Number(k);
        if (roundNo >= fromRound && r.state !== 'scored') {
          const bids = { ...(r.bids ?? {}) } as Record<string, number>;
          const made = { ...(r.made ?? {}) } as Record<string, boolean | null>;
          delete bids[id];
          delete made[id];
          const present = { ...(r.present ?? {}) } as Record<string, boolean>;
          present[id] = false;
          rounds[roundNo] = { ...r, bids, made, present } as RoundData;
        } else {
          rounds[roundNo] = r;
        }
      }
      return { ...state, rounds };
    }
    case 'player/resumed': {
      const { id, fromRound } = event.payload as EventMap['player/resumed'];
      if (!state.players[id]) return state;
      const rounds: Record<number, RoundData> = {};
      for (const [k, r] of Object.entries(state.rounds)) {
        const roundNo = Number(k);
        if (roundNo >= fromRound && r.state !== 'scored') {
          const present = { ...(r.present ?? {}) } as Record<string, boolean>;
          present[id] = true;
          rounds[roundNo] = { ...r, present } as RoundData;
        } else {
          rounds[roundNo] = r;
        }
      }
      return { ...state, rounds };
    }
    case 'score/added': {
      const { playerId, delta } = event.payload as EventMap['score/added'];
      const next = (state.scores[playerId] ?? 0) + delta;
      return { ...state, scores: { ...state.scores, [playerId]: next } };
    }
    case 'round/state-set': {
      const { round, state: rState } = event.payload as EventMap['round/state-set'];
      const r = state.rounds[round] ?? { state: 'locked', bids: {}, made: {} };
      return { ...state, rounds: { ...state.rounds, [round]: { ...r, state: rState } } };
    }
    case 'bid/set': {
      const { round, playerId, bid } = event.payload as EventMap['bid/set'];
      const r = state.rounds[round] ?? { state: 'locked', bids: {}, made: {} };
      if (r.present?.[playerId] === false) return state;
      const clamped = clampBid(round, bid);
      return {
        ...state,
        rounds: { ...state.rounds, [round]: { ...r, bids: { ...r.bids, [playerId]: clamped } } },
      };
    }
    case 'made/set': {
      const { round, playerId, made } = event.payload as EventMap['made/set'];
      const r = state.rounds[round] ?? { state: 'locked', bids: {}, made: {} };
      if (r.present?.[playerId] === false) return state;
      return {
        ...state,
        rounds: { ...state.rounds, [round]: { ...r, made: { ...r.made, [playerId]: !!made } } },
      };
    }
    case 'round/finalize': {
      const { round } = event.payload as EventMap['round/finalize'];
      return finalizeRound(state, round);
    }
    default:
      return state;
  }
}
