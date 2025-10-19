import { clampBid, finalizeRound } from './logic';
import type { Rank } from '@/lib/single-player/types';
import type { AppEvent, AppState, EventMap, EventPayloadByType } from './types';
import { INITIAL_STATE, type AppEventType, type KnownAppEvent } from './types';
import * as rosterOps from '@/lib/roster/ops';
import { eventPayloadSchemas } from '@/schema/events';
import { uuid } from '@/lib/utils';

function coerceTimestamp(event: KnownAppEvent): number {
  const ts = Number(event.ts);
  return Number.isFinite(ts) ? ts : Date.now();
}

function deriveAutoScorecardRosterId(event: KnownAppEvent, state: AppState): string {
  const existing = new Set(Object.keys(state.rosters ?? {}));
  const parts: string[] = [];
  const ts = coerceTimestamp(event);
  if (Number.isFinite(ts)) {
    parts.push(`ts${Math.floor(ts).toString(36)}`);
  }
  if (typeof event.eventId === 'string') {
    const normalized = event.eventId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (normalized) {
      parts.push(normalized);
    }
  }
  if (parts.length === 0) {
    parts.push('auto');
  }
  let base = `scorecard-${parts.join('-')}`.replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!base) {
    base = 'scorecard-auto';
  }
  if (base === 'scorecard-default') {
    base = 'scorecard-default-1';
  }
  let candidate = base;
  let suffix = 1;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

function applyPlayerAdded(
  state: AppState,
  event: KnownAppEvent,
  payload: { id: string; name: string; type: 'human' | 'bot'; isRestore?: boolean },
): AppState {
  const id = payload.id;
  const trimmed = String(payload.name ?? '').trim();
  if (!id || !trimmed) return state;
  const isExisting = Boolean(state.players[id]);
  if (isExisting && !payload.isRestore) return state;

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
  const rounds: Record<number, AppState['rounds'][number]> = {};
  for (const [k, r] of Object.entries(state.rounds)) {
    const rn = Number(k);
    const present = { ...(r.present ?? {}) } as Record<string, boolean>;
    present[id] = rn >= joinIndex;
    rounds[rn] = { ...r, present } as AppState['rounds'][number];
  }

  let nextState: AppState = {
    ...state,
    players: { ...state.players, [id]: trimmed },
    display_order,
    rounds,
  };

  let rid = nextState.activeScorecardRosterId;
  if (!rid || !nextState.rosters[rid]) {
    const nrid = deriveAutoScorecardRosterId(event, nextState);
    const createdAt = coerceTimestamp(event);
    const roster = {
      name: 'Score Card',
      playersById: {} as Record<string, string>,
      playerTypesById: {} as Record<string, 'human' | 'bot'>,
      displayOrder: {} as Record<string, number>,
      type: 'scorecard' as const,
      createdAt,
      archivedAt: null,
    };
    nextState = {
      ...nextState,
      rosters: { ...nextState.rosters, [nrid]: roster },
      activeScorecardRosterId: nrid,
    };
    rid = nrid;
  }
  const r = nextState.rosters[rid]!;
  const scPlayers = { ...r.playersById, [id]: String(trimmed) };
  const scTypes = { ...(r.playerTypesById ?? {}), [id]: payload.type };
  const entries = Object.entries(r.displayOrder).sort((a, b) => a[1] - b[1]);
  const ordered = entries.map(([pid]) => pid);
  if (!ordered.includes(id)) ordered.push(id);
  const scOrder: Record<string, number> = {};
  for (let i = 0; i < ordered.length; i++) scOrder[ordered[i]!] = i;
  nextState = {
    ...nextState,
    rosters: {
      ...nextState.rosters,
      [rid]: { ...r, playersById: scPlayers, playerTypesById: scTypes, displayOrder: scOrder },
    },
  };

  const ts = coerceTimestamp(event);
  const prevDetail = state.playerDetails?.[id];
  const detail = {
    name: trimmed,
    type: payload.type,
    archived: false,
    archivedAt: null,
    createdAt: prevDetail?.createdAt ?? ts,
    updatedAt: ts,
  } as const;
  nextState = {
    ...nextState,
    playerDetails: { ...nextState.playerDetails, [id]: detail },
  };

  if (!payload.isRestore) {
    const scores = { ...nextState.scores };
    if (!(id in scores)) scores[id] = 0;
    nextState = { ...nextState, scores };
  }

  return nextState;
}

function reduceRosterAndPlayers(state: AppState, event: KnownAppEvent): AppState | null {
  switch (event.type) {
    case 'roster/created': {
      const p = event.payload as EventMap['roster/created'];
      return rosterOps.createRoster(state, {
        rosterId: p.rosterId,
        name: p.name,
        type: p.type,
      });
    }
    case 'roster/renamed': {
      const p = event.payload as EventMap['roster/renamed'];
      return rosterOps.renameRoster(state, { rosterId: p.rosterId, name: p.name });
    }
    case 'roster/activated': {
      const p = event.payload as EventMap['roster/activated'];
      return rosterOps.activateRoster(state, { rosterId: p.rosterId, mode: p.mode });
    }
    case 'roster/player/added': {
      const p = event.payload as EventMap['roster/player/added'];
      const base = {
        rosterId: p.rosterId,
        id: p.id,
        name: p.name,
      } as {
        rosterId: string;
        id: string;
        name: string;
        type?: 'human' | 'bot';
      };
      if (p.type !== undefined) base.type = p.type;
      return rosterOps.addPlayer(state, base);
    }
    case 'roster/player/renamed': {
      const p = event.payload as EventMap['roster/player/renamed'];
      return rosterOps.renamePlayer(state, { rosterId: p.rosterId, id: p.id, name: p.name });
    }
    case 'roster/player/removed': {
      const p = event.payload as EventMap['roster/player/removed'];
      return rosterOps.removePlayer(state, { rosterId: p.rosterId, id: p.id });
    }
    case 'roster/player/type-set': {
      const p = event.payload as EventMap['roster/player/type-set'];
      return rosterOps.setPlayerType(state, { rosterId: p.rosterId, id: p.id, type: p.type });
    }
    case 'roster/players/reordered': {
      const p = event.payload as EventMap['roster/players/reordered'];
      return rosterOps.reorderPlayers(state, { rosterId: p.rosterId, order: p.order });
    }
    case 'roster/reset': {
      const p = event.payload as EventMap['roster/reset'];
      return rosterOps.resetRoster(state, { rosterId: p.rosterId });
    }
    case 'roster/archived': {
      const p = event.payload as EventMap['roster/archived'];
      let nextState = rosterOps.archiveRoster(state, {
        rosterId: p.rosterId,
        archivedAt: coerceTimestamp(event),
      });
      if (nextState.activeScorecardRosterId === p.rosterId) {
        nextState = { ...nextState, activeScorecardRosterId: null };
      }
      if (nextState.activeSingleRosterId === p.rosterId) {
        nextState = { ...nextState, activeSingleRosterId: null };
      }
      return nextState;
    }
    case 'roster/restored': {
      const p = event.payload as EventMap['roster/restored'];
      return rosterOps.restoreRoster(state, {
        rosterId: p.rosterId,
        restoredAt: coerceTimestamp(event),
      });
    }
    case 'roster/deleted': {
      const p = event.payload as EventMap['roster/deleted'];
      let nextState = rosterOps.deleteRoster(state, { rosterId: p.rosterId });
      if (nextState.activeScorecardRosterId === p.rosterId) {
        nextState = { ...nextState, activeScorecardRosterId: null };
      }
      if (nextState.activeSingleRosterId === p.rosterId) {
        nextState = { ...nextState, activeSingleRosterId: null };
      }
      return nextState;
    }
    case 'player/added': {
      const { id, name, type } = event.payload as EventMap['player/added'];
      const normalizedType: 'human' | 'bot' = type ?? state.playerDetails?.[id]?.type ?? 'human';
      return applyPlayerAdded(state, event, { id, name, type: normalizedType });
    }
    case 'player/renamed': {
      const { id, name } = event.payload as EventMap['player/renamed'];
      if (!state.players[id]) return state;
      let nextState: AppState = { ...state, players: { ...state.players, [id]: String(name) } };
      const rid = nextState.activeScorecardRosterId;
      if (rid && nextState.rosters[rid]) {
        const r = nextState.rosters[rid]!;
        if (r.playersById[id] != null) {
          const scPlayers = { ...r.playersById, [id]: String(name) };
          nextState = {
            ...nextState,
            rosters: { ...nextState.rosters, [rid]: { ...r, playersById: scPlayers } },
          };
        }
      }
      const ts = coerceTimestamp(event);
      const prevDetail = state.playerDetails?.[id];
      const detail = {
        name: String(name),
        type: prevDetail?.type ?? 'human',
        archived: prevDetail?.archived ?? false,
        archivedAt: prevDetail?.archivedAt ?? null,
        createdAt: prevDetail?.createdAt ?? ts,
        updatedAt: ts,
      } as const;
      nextState = {
        ...nextState,
        playerDetails: { ...nextState.playerDetails, [id]: detail },
      };
      return nextState;
    }
    case 'player/removed': {
      const { id } = event.payload as EventMap['player/removed'];
      if (!state.players[id]) return state;
      const restPlayers: Record<string, string> = { ...state.players };
      delete restPlayers[id];
      const restScores: Record<string, number> = { ...state.scores };
      delete restScores[id];
      const rounds: Record<number, AppState['rounds'][number]> = {};
      for (const [k, r] of Object.entries(state.rounds)) {
        const bids: Record<string, number> = { ...r.bids };
        delete bids[id];
        const made: Record<string, boolean | null> = { ...r.made };
        delete made[id];
        const present = { ...(r.present ?? {}) } as Record<string, boolean>;
        delete present[id];
        rounds[Number(k)] = { ...r, bids, made, present } as AppState['rounds'][number];
      }
      const entries = Object.entries(state.display_order ?? {}).filter(([pid]) => pid !== id);
      entries.sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0));
      const display_order: Record<string, number> = {};
      for (let i = 0; i < entries.length; i++) display_order[entries[i]![0]] = i;
      let nextState: AppState = {
        ...state,
        players: restPlayers,
        scores: restScores,
        rounds,
        display_order,
      };
      const rid = nextState.activeScorecardRosterId;
      if (rid && nextState.rosters[rid]) {
        const r = nextState.rosters[rid]!;
        if (r.playersById[id] != null) {
          const scPlayers = { ...r.playersById };
          delete scPlayers[id];
          const scEntries = Object.entries(r.displayOrder)
            .filter(([pid]) => pid !== id)
            .sort((a, b) => a[1] - b[1]);
          const scOrder: Record<string, number> = {};
          for (let i = 0; i < scEntries.length; i++) scOrder[scEntries[i]![0]] = i;
          nextState = {
            ...nextState,
            rosters: {
              ...nextState.rosters,
              [rid]: { ...r, playersById: scPlayers, displayOrder: scOrder },
            },
          };
        }
      }
      const ts = coerceTimestamp(event);
      const prevDetail = state.playerDetails?.[id];
      const detail = {
        name: prevDetail?.name ?? state.players[id] ?? id,
        type: prevDetail?.type ?? 'human',
        archived: true,
        archivedAt: ts,
        createdAt: prevDetail?.createdAt ?? ts,
        updatedAt: ts,
      } as const;
      nextState = {
        ...nextState,
        playerDetails: { ...nextState.playerDetails, [id]: detail },
      };
      return nextState;
    }
    case 'players/reordered': {
      const { order } = event.payload as EventMap['players/reordered'];
      const knownIds = new Set(Object.keys(state.players));
      const filtered = order.filter((id) => knownIds.has(id));
      const prevOrderEntries = Object.entries(state.display_order ?? {}).sort(
        (a, b) => a[1] - b[1],
      );
      const prevOrder = prevOrderEntries.map(([pid]) => pid).filter((pid) => knownIds.has(pid));
      for (const pid of prevOrder) if (!filtered.includes(pid)) filtered.push(pid);
      for (const pid of Object.keys(state.players)) if (!filtered.includes(pid)) filtered.push(pid);
      const display_order: Record<string, number> = {};
      for (let i = 0; i < filtered.length; i++) display_order[filtered[i]!] = i;
      let nextState: AppState = { ...state, display_order };
      const rid = nextState.activeScorecardRosterId;
      if (rid && nextState.rosters[rid]) {
        const r = nextState.rosters[rid]!;
        const known = new Set(Object.keys(r.playersById));
        const scFiltered = filtered.filter((id) => known.has(id));
        for (const id of Object.keys(r.playersById))
          if (!scFiltered.includes(id)) scFiltered.push(id);
        const scOrder: Record<string, number> = {};
        for (let i = 0; i < scFiltered.length; i++) scOrder[scFiltered[i]!] = i;
        nextState = {
          ...nextState,
          rosters: { ...nextState.rosters, [rid]: { ...r, displayOrder: scOrder } },
        };
      }
      return nextState;
    }
    case 'player/type-set': {
      const { id, type } = event.payload as EventMap['player/type-set'];
      const detail = state.playerDetails?.[id];
      if (!detail) return state;
      const ts = coerceTimestamp(event);
      return {
        ...state,
        playerDetails: {
          ...state.playerDetails,
          [id]: { ...detail, type, updatedAt: ts },
        },
      } as AppState;
    }
    case 'player/restored': {
      const { id } = event.payload as EventMap['player/restored'];
      if (state.players[id]) return state;
      const detail = state.playerDetails?.[id];
      if (!detail) return state;
      return applyPlayerAdded(state, event, {
        id,
        name: detail.name,
        type: detail.type,
        isRestore: true,
      });
    }
    default:
      return null;
  }
}

function reduceRounds(state: AppState, event: KnownAppEvent): AppState | null {
  switch (event.type) {
    case 'player/dropped': {
      const { id, fromRound } = event.payload as EventMap['player/dropped'];
      if (!state.players[id]) return state;
      const rounds: Record<number, AppState['rounds'][number]> = {};
      for (const [k, r] of Object.entries(state.rounds)) {
        const roundNo = Number(k);
        if (roundNo >= fromRound && r.state !== 'scored') {
          const bids = { ...(r.bids ?? {}) } as Record<string, number>;
          const made = { ...(r.made ?? {}) } as Record<string, boolean | null>;
          delete bids[id];
          delete made[id];
          const present = { ...(r.present ?? {}) } as Record<string, boolean>;
          present[id] = false;
          rounds[roundNo] = { ...r, bids, made, present } as AppState['rounds'][number];
        } else {
          rounds[roundNo] = r;
        }
      }
      return { ...state, rounds };
    }
    case 'player/resumed': {
      const { id, fromRound } = event.payload as EventMap['player/resumed'];
      if (!state.players[id]) return state;
      const rounds: Record<number, AppState['rounds'][number]> = {};
      for (const [k, r] of Object.entries(state.rounds)) {
        const roundNo = Number(k);
        if (roundNo >= fromRound && r.state !== 'scored') {
          const present = { ...(r.present ?? {}) } as Record<string, boolean>;
          present[id] = true;
          rounds[roundNo] = { ...r, present } as AppState['rounds'][number];
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
      const r =
        state.rounds[round] ??
        ({ state: 'locked', bids: {}, made: {} } as AppState['rounds'][number]);
      return { ...state, rounds: { ...state.rounds, [round]: { ...r, state: rState } } };
    }
    case 'bid/set': {
      const { round, playerId, bid } = event.payload as EventMap['bid/set'];
      const r =
        state.rounds[round] ??
        ({ state: 'locked', bids: {}, made: {} } as AppState['rounds'][number]);
      if (r.present?.[playerId] === false) return state;
      const clamped = clampBid(round, bid);
      return {
        ...state,
        rounds: { ...state.rounds, [round]: { ...r, bids: { ...r.bids, [playerId]: clamped } } },
      };
    }
    case 'made/set': {
      const { round, playerId, made } = event.payload as EventMap['made/set'];
      const r =
        state.rounds[round] ??
        ({ state: 'locked', bids: {}, made: {} } as AppState['rounds'][number]);
      if (r.present?.[playerId] === false) return state;
      const nextValue = made === null ? null : !!made;
      return {
        ...state,
        rounds: { ...state.rounds, [round]: { ...r, made: { ...r.made, [playerId]: nextValue } } },
      };
    }
    case 'round/finalize': {
      const { round } = event.payload as EventPayloadByType<'round/finalize'>;
      return finalizeRound(state, round);
    }
    default:
      return null;
  }
}

function reduceSinglePlayer(state: AppState, event: KnownAppEvent): AppState | null {
  switch (event.type) {
    case 'sp/reset':
      return { ...state, sp: { ...INITIAL_STATE.sp } };
    case 'sp/deal': {
      const p = event.payload as EventMap['sp/deal'];
      const hands: AppState['sp']['hands'] = {};
      for (const [id, cards] of Object.entries(p.hands)) {
        hands[id] = cards.map((card) => ({ suit: card.suit, rank: card.rank as Rank }));
      }
      return {
        ...state,
        sp: {
          ...state.sp,
          phase: 'bidding',
          roundNo: p.roundNo,
          dealerId: p.dealerId,
          order: [...p.order],
          trump: p.trump,
          trumpCard: { suit: p.trumpCard.suit, rank: p.trumpCard.rank as Rank },
          hands,
          trickPlays: [],
          trickCounts: Object.fromEntries(Object.keys(state.players).map((id) => [id, 0])),
          trumpBroken: false,
          handPhase: 'idle',
          lastTrickSnapshot: null,
        },
      };
    }
    case 'sp/phase-set': {
      const { phase } = event.payload as EventMap['sp/phase-set'];
      return { ...state, sp: { ...state.sp, phase } };
    }
    case 'sp/trick/played': {
      const payload = event.payload as EventMap['sp/trick/played'];
      const { playerId } = payload;
      const normalizedCard = {
        suit: payload.card.suit,
        rank: payload.card.rank as Rank,
      };
      if (state.sp.trickPlays.some((p) => p.playerId === playerId)) return state;
      const order = state.sp.order ?? [];
      const curPlays = state.sp.trickPlays ?? [];
      const currentLeader = curPlays[0]?.playerId ?? state.sp.leaderId;
      if (currentLeader) {
        const leaderIdx = order.indexOf(currentLeader);
        if (leaderIdx >= 0) {
          const rotated = [...order.slice(leaderIdx), ...order.slice(0, leaderIdx)];
          const expected = rotated[curPlays.length];
          if (expected && expected !== playerId) {
            return state;
          }
        }
      }
      const trickPlays = [...state.sp.trickPlays, { playerId, card: normalizedCard }];
      const lastTrickSnapshot = curPlays.length === 0 ? null : (state.sp.lastTrickSnapshot ?? null);
      const hands = { ...state.sp.hands };
      const arr = [...(hands[playerId] ?? [])];
      const idx = arr.findIndex(
        (c) => c && c.suit === normalizedCard.suit && c.rank === normalizedCard.rank,
      );
      if (idx >= 0) arr.splice(idx, 1);
      hands[playerId] = arr;
      return { ...state, sp: { ...state.sp, trickPlays, hands, lastTrickSnapshot } };
    }
    case 'sp/trick/cleared': {
      if (!state.sp.trickPlays || state.sp.trickPlays.length === 0) return state;
      return {
        ...state,
        sp: { ...state.sp, trickPlays: [], reveal: null, handPhase: 'idle' },
      } as AppState;
    }
    case 'sp/trick/reveal-set': {
      const { winnerId } = event.payload as EventMap['sp/trick/reveal-set'];
      if (state.sp.reveal) return state;
      const trickCounts = {
        ...state.sp.trickCounts,
        [winnerId]: (state.sp.trickCounts[winnerId] ?? 0) + 1,
      };
      const plays: Array<AppState['sp']['trickPlays'][number]> = (state.sp.trickPlays ?? []).map(
        (play) => ({
          playerId: play.playerId,
          card: { ...play.card },
        }),
      );
      const ledBy = plays[0]?.playerId ?? state.sp.leaderId ?? null;
      const lastTrickSnapshot =
        ledBy && plays.length > 0
          ? {
              ledBy,
              plays,
              winnerId,
            }
          : (state.sp.lastTrickSnapshot ?? null);
      return {
        ...state,
        sp: {
          ...state.sp,
          reveal: { winnerId },
          trickCounts,
          lastTrickSnapshot,
          handPhase: 'revealing',
        },
      };
    }
    case 'sp/trick/reveal-clear':
      return { ...state, sp: { ...state.sp, reveal: null, handPhase: 'idle' } };
    case 'sp/trump-broken-set': {
      const { broken } = event.payload as EventMap['sp/trump-broken-set'];
      return { ...state, sp: { ...state.sp, trumpBroken: !!broken } };
    }
    case 'sp/leader-set': {
      const { leaderId } = event.payload as EventMap['sp/leader-set'];
      return { ...state, sp: { ...state.sp, leaderId } };
    }
    case 'sp/summary-entered-set': {
      const { at } = event.payload as EventMap['sp/summary-entered-set'];
      return { ...state, sp: { ...state.sp, summaryEnteredAt: Math.floor(at) } };
    }
    case 'sp/seed-set': {
      const { seed } = event.payload as EventMap['sp/seed-set'];
      const n = Math.floor(seed);
      return { ...state, sp: { ...state.sp, sessionSeed: Number.isFinite(n) ? n : 0 } };
    }
    case 'sp/round-tally-set': {
      const { round: roundNo, tallies } = event.payload as EventMap['sp/round-tally-set'];
      const roundTallies = { ...(state.sp.roundTallies ?? {}) };
      roundTallies[roundNo] = { ...tallies };
      return { ...state, sp: { ...state.sp, roundTallies } };
    }
    default:
      return null;
  }
}

const reducers = [reduceRosterAndPlayers, reduceRounds, reduceSinglePlayer] as const;

export function reduce(state: AppState, event: AppEvent): AppState {
  const handlerEventType = event.type as AppEventType;
  const knownEvent =
    typeof handlerEventType === 'string' && handlerEventType in eventPayloadSchemas
      ? (event as KnownAppEvent)
      : null;
  if (!knownEvent) {
    return state;
  }
  for (const reducer of reducers) {
    const next = reducer(state, knownEvent);
    if (next) return next;
  }
  return state;
}
