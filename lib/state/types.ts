export type UUID = string;

// Event catalog mapping type -> payload shape
export type EventMap = {
  'player/added': { id: string; name: string };
  'player/renamed': { id: string; name: string };
  'player/removed': { id: string };
  'score/added': { playerId: string; delta: number };
  'round/state-set': { round: number; state: RoundState };
  'bid/set': { round: number; playerId: string; bid: number };
  'made/set': { round: number; playerId: string; made: boolean };
  'round/finalize': { round: number };
  // Single-player events
  'sp/reset': Record<never, never>;
  'sp/deal': {
    roundNo: number;
    dealerId: string;
    order: string[];
    trump: 'clubs' | 'diamonds' | 'hearts' | 'spades';
    trumpCard: { suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'; rank: number };
    hands: Record<
      string,
      Array<{ suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'; rank: number }>
    >;
  };
  'sp/phase-set': { phase: 'setup' | 'bidding' | 'playing' | 'done' };
  'sp/trick/played': {
    playerId: string;
    card: { suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'; rank: number };
  };
  'sp/trick/cleared': { winnerId: string };
  'sp/trump-broken-set': { broken: boolean };
  'sp/leader-set': { leaderId: string };
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

export type RoundState = 'locked' | 'bidding' | 'playing' | 'complete' | 'scored';

export type RoundData = Readonly<{
  state: RoundState;
  bids: Record<string, number>;
  made: Record<string, boolean | null>;
}>;

export type AppState = Readonly<{
  players: Record<string, string>;
  scores: Record<string, number>;
  rounds: Record<number, RoundData>;
  sp: Readonly<{
    phase: 'setup' | 'bidding' | 'playing' | 'done';
    roundNo: number | null;
    dealerId: string | null;
    order: string[];
    trump: 'clubs' | 'diamonds' | 'hearts' | 'spades' | null;
    trumpCard: { suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'; rank: number } | null;
    hands: Record<
      string,
      Array<{ suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'; rank: number }>
    >;
    trickPlays: Array<{
      playerId: string;
      card: { suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'; rank: number };
    }>;
    trickCounts: Record<string, number>;
    trumpBroken: boolean;
    leaderId: string | null;
  }>;
}>;
import { initialRounds, clampBid, finalizeRound } from './logic';

export const INITIAL_STATE: AppState = {
  players: {},
  scores: {},
  rounds: initialRounds(),
  sp: {
    phase: 'setup',
    roundNo: null,
    dealerId: null,
    order: [],
    trump: null,
    trumpCard: null,
    hands: {},
    trickPlays: [],
    trickCounts: {},
    trumpBroken: false,
    leaderId: null,
  },
} as const;

export function reduce(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case 'player/added': {
      const { id, name } = event.payload as EventMap['player/added'];
      if (state.players[id]) return state;
      return { ...state, players: { ...state.players, [id]: name } };
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
        rounds[Number(k)] = { ...r, bids, made };
      }
      return { ...state, players: restPlayers, scores: restScores, rounds };
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
      const clamped = clampBid(round, bid);
      return {
        ...state,
        rounds: { ...state.rounds, [round]: { ...r, bids: { ...r.bids, [playerId]: clamped } } },
      };
    }
    case 'made/set': {
      const { round, playerId, made } = event.payload as EventMap['made/set'];
      const r = state.rounds[round] ?? { state: 'locked', bids: {}, made: {} };
      return {
        ...state,
        rounds: { ...state.rounds, [round]: { ...r, made: { ...r.made, [playerId]: !!made } } },
      };
    }
    case 'round/finalize': {
      const { round } = event.payload as EventMap['round/finalize'];
      return finalizeRound(state, round);
    }
    // Single-player state transitions
    case 'sp/reset': {
      return { ...state, sp: { ...INITIAL_STATE.sp } };
    }
    case 'sp/deal': {
      const p = event.payload as EventMap['sp/deal'];
      return {
        ...state,
        sp: {
          ...state.sp,
          phase: 'bidding',
          roundNo: p.roundNo,
          dealerId: p.dealerId,
          order: [...p.order],
          trump: p.trump,
          trumpCard: { ...p.trumpCard },
          hands: { ...p.hands },
          trickPlays: [],
          trickCounts: Object.fromEntries(Object.keys(state.players).map((id) => [id, 0])),
          trumpBroken: false,
        },
      };
    }
    case 'sp/phase-set': {
      const { phase } = event.payload as EventMap['sp/phase-set'];
      return { ...state, sp: { ...state.sp, phase } };
    }
    case 'sp/trick/played': {
      const { playerId, card } = event.payload as EventMap['sp/trick/played'];
      // Idempotency: ignore if this player already played in the current trick
      if (state.sp.trickPlays.some((p) => p.playerId === playerId)) return state;
      const trickPlays = [...state.sp.trickPlays, { playerId, card }];
      const hands = { ...state.sp.hands };
      const arr = [...(hands[playerId] ?? [])];
      const idx = arr.findIndex((c) => c && c.suit === card.suit && c.rank === card.rank);
      if (idx >= 0) arr.splice(idx, 1);
      hands[playerId] = arr;
      return { ...state, sp: { ...state.sp, trickPlays, hands } };
    }
    case 'sp/trick/cleared': {
      const { winnerId } = event.payload as EventMap['sp/trick/cleared'];
      // Idempotency: only clear/increment if there were plays to clear
      if (!state.sp.trickPlays || state.sp.trickPlays.length === 0) return state;
      const trickCounts = {
        ...state.sp.trickCounts,
        [winnerId]: (state.sp.trickCounts[winnerId] ?? 0) + 1,
      };
      return { ...state, sp: { ...state.sp, trickPlays: [], trickCounts } };
    }
    case 'sp/trump-broken-set': {
      const { broken } = event.payload as EventMap['sp/trump-broken-set'];
      return { ...state, sp: { ...state.sp, trumpBroken: !!broken } };
    }
    case 'sp/leader-set': {
      const { leaderId } = event.payload as EventMap['sp/leader-set'];
      return { ...state, sp: { ...state.sp, leaderId } };
    }
    default:
      return state;
  }
}
