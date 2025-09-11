export type UUID = string;

// Event catalog mapping type -> payload shape
export type EventMap = {
  'player/added': { id: string; name: string };
  'player/renamed': { id: string; name: string };
  'player/removed': { id: string };
  'players/reordered': { order: string[] };
  'player/dropped': { id: string; fromRound: number };
  'player/resumed': { id: string; fromRound: number };
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
  'sp/trick/reveal-set': { winnerId: string };
  'sp/trick/reveal-clear': Record<never, never>;
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
  // If present[pid] === false, player is absent for the round. Missing implies present.
  present?: Record<string, boolean>;
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
    reveal: { winnerId: string } | null;
  }>;
  // Optional dense display order per player ID. Missing entries are handled by selectors.
  display_order: Record<string, number>;
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
    reveal: null,
  },
  display_order: {},
} as const;

export function reduce(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case 'player/added': {
      const { id, name } = event.payload as EventMap['player/added'];
      if (state.players[id]) return state;
      // Assign next order index if any ordering exists; else leave mapping untouched (selector will fallback)
      const hasAnyOrder = Object.keys(state.display_order ?? {}).length > 0;
      const nextIdx = hasAnyOrder
        ? Math.max(
            -1,
            ...Object.values(state.display_order ?? {}).map((n) => (Number.isFinite(n) ? n : -1)),
          ) + 1
        : 0;
      const display_order = hasAnyOrder
        ? { ...(state.display_order ?? {}), [id]: nextIdx }
        : { ...(state.display_order ?? {}) };
      // Initialize per-round presence using a stable join index:
      // joinIndex = 1 + max(roundIndex where state === 'scored') at the time of adding.
      // This ensures late joiners remain absent for previously scored rounds
      // even if a past round is temporarily toggled back to bidding/complete.
      let maxScored = 0;
      const biddingRounds: number[] = [];
      for (const [rk, rr] of Object.entries(state.rounds)) {
        const rn = Number(rk);
        const st = rr?.state ?? 'locked';
        if (st === 'scored') maxScored = Math.max(maxScored, rn);
        if (st === 'bidding') biddingRounds.push(rn);
      }
      biddingRounds.sort((a, b) => a - b);
      const joinIndex = biddingRounds.length > 0 ? biddingRounds[0]! : maxScored + 1;
      const rounds: Record<number, RoundData> = {};
      for (const [k, r] of Object.entries(state.rounds)) {
        const rn = Number(k);
        const present = { ...(r.present ?? {}) } as Record<string, boolean>;
        present[id] = rn >= joinIndex;
        rounds[rn] = { ...r, present } as RoundData;
      }
      return { ...state, players: { ...state.players, [id]: name }, display_order, rounds };
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
      // Remove from display_order and reindex remaining densely 0..N-1 preserving relative order
      const entries = Object.entries(state.display_order ?? {}).filter(([pid]) => pid !== id);
      entries.sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0));
      const display_order: Record<string, number> = {};
      for (let i = 0; i < entries.length; i++) display_order[entries[i]![0]] = i;
      return { ...state, players: restPlayers, scores: restScores, rounds, display_order };
    }
    case 'players/reordered': {
      // Build dense mapping from provided order, ignoring unknown IDs, appending any missing known players
      const { order } = event.payload as EventMap['players/reordered'];
      const knownIds = new Set(Object.keys(state.players));
      const filtered = order.filter((id) => knownIds.has(id));
      // Append any players not present in payload in their previous relative order
      const prevOrderEntries = Object.entries(state.display_order ?? {}).sort(
        (a, b) => a[1] - b[1],
      );
      const prevOrder = prevOrderEntries.map(([pid]) => pid).filter((pid) => knownIds.has(pid));
      for (const pid of prevOrder) if (!filtered.includes(pid)) filtered.push(pid);
      for (const pid of Object.keys(state.players)) if (!filtered.includes(pid)) filtered.push(pid);
      const display_order: Record<string, number> = {};
      for (let i = 0; i < filtered.length; i++) display_order[filtered[i]!] = i;
      return { ...state, display_order };
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
      // Enforce turn order: expected player is based on current trick leader (first play if any, else leaderId)
      const order = state.sp.order ?? [];
      const curPlays = state.sp.trickPlays ?? [];
      const currentLeader = curPlays[0]?.playerId ?? state.sp.leaderId;
      if (currentLeader) {
        const leaderIdx = order.indexOf(currentLeader);
        if (leaderIdx >= 0) {
          const rotated = [...order.slice(leaderIdx), ...order.slice(0, leaderIdx)];
          const expected = rotated[curPlays.length];
          if (expected && expected !== playerId) {
            // Out-of-turn play; ignore event
            return state;
          }
        }
      }
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
    case 'sp/trick/reveal-set': {
      const { winnerId } = event.payload as EventMap['sp/trick/reveal-set'];
      return { ...state, sp: { ...state.sp, reveal: { winnerId } } };
    }
    case 'sp/trick/reveal-clear': {
      if (!state.sp.reveal) return state;
      return { ...state, sp: { ...state.sp, reveal: null } };
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
