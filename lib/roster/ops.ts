import type { AppState, UUID } from '@/lib/state/types';

function clone<T>(obj: T): T {
  return Object.assign(Array.isArray(obj) ? [] : {}, obj) as T;
}

function ensureRoster(next: AppState, rosterId: UUID) {
  const r = next.rosters[rosterId];
  if (!r) return null;
  return r;
}

export function createRoster(
  state: AppState,
  p: { rosterId: UUID; name: string; type: 'scorecard' | 'single'; createdAt?: number },
): AppState {
  if (state.rosters[p.rosterId]) return state;
  const createdAt = Number.isFinite(p.createdAt) ? Math.floor(p.createdAt!) : Date.now();
  const roster = {
    name: String(p.name),
    playersById: {} as Record<UUID, string>,
    displayOrder: {} as Record<UUID, number>,
    type: p.type,
    createdAt,
  } as const;
  const rosters = clone(state.rosters);
  rosters[p.rosterId] = roster;
  return Object.assign({}, state, { rosters });
}

export function renameRoster(state: AppState, p: { rosterId: UUID; name: string }): AppState {
  const r = state.rosters[p.rosterId];
  if (!r) return state;
  const rosters = clone(state.rosters);
  rosters[p.rosterId] = Object.assign({}, r, { name: String(p.name) });
  return Object.assign({}, state, { rosters });
}

export function activateRoster(
  state: AppState,
  p: { rosterId: UUID; mode: 'scorecard' | 'single' },
): AppState {
  if (!state.rosters[p.rosterId]) return state;
  if (p.mode === 'scorecard')
    return Object.assign({}, state, { activeScorecardRosterId: p.rosterId });
  return Object.assign({}, state, { activeSingleRosterId: p.rosterId });
}

export function addPlayer(
  state: AppState,
  p: { rosterId: UUID; id: UUID; name: string },
): AppState {
  const r = ensureRoster(state, p.rosterId);
  if (!r) return state;
  if (r.playersById[p.id]) return state;
  const playersById = clone(r.playersById);
  playersById[p.id] = String(p.name);
  const displayOrder = clone(r.displayOrder);
  const nextIdx =
    Math.max(-1, ...Object.values(displayOrder).map((n) => (Number.isFinite(n) ? n : -1))) + 1;
  displayOrder[p.id] = nextIdx;
  const rosters = clone(state.rosters);
  rosters[p.rosterId] = Object.assign({}, r, { playersById, displayOrder });
  return Object.assign({}, state, { rosters });
}

export function renamePlayer(
  state: AppState,
  p: { rosterId: UUID; id: UUID; name: string },
): AppState {
  const r = ensureRoster(state, p.rosterId);
  if (!r || !r.playersById[p.id]) return state;
  const playersById = clone(r.playersById);
  playersById[p.id] = String(p.name);
  const rosters = clone(state.rosters);
  rosters[p.rosterId] = Object.assign({}, r, { playersById });
  return Object.assign({}, state, { rosters });
}

export function removePlayer(state: AppState, p: { rosterId: UUID; id: UUID }): AppState {
  const r = ensureRoster(state, p.rosterId);
  if (!r || !r.playersById[p.id]) return state;
  const playersById = clone(r.playersById);
  delete playersById[p.id];
  const entries = Object.entries(r.displayOrder).filter(([id]) => id !== p.id);
  entries.sort((a, b) => a[1] - b[1]);
  const displayOrder: Record<string, number> = {};
  for (let i = 0; i < entries.length; i++) displayOrder[entries[i]![0]] = i;
  const rosters = clone(state.rosters);
  rosters[p.rosterId] = Object.assign({}, r, { playersById, displayOrder });
  return Object.assign({}, state, { rosters });
}

export function reorderPlayers(state: AppState, p: { rosterId: UUID; order: string[] }): AppState {
  const r = ensureRoster(state, p.rosterId);
  if (!r) return state;
  const known = new Set(Object.keys(r.playersById));
  const filtered = p.order.filter((id) => known.has(id));
  // Append missing in prev order
  const prev = Object.entries(r.displayOrder)
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id)
    .filter((id) => known.has(id));
  for (const id of prev) if (!filtered.includes(id)) filtered.push(id);
  for (const id of Object.keys(r.playersById)) if (!filtered.includes(id)) filtered.push(id);
  const displayOrder: Record<string, number> = {};
  for (let i = 0; i < filtered.length; i++) {
    const id = filtered[i]!;
    displayOrder[id] = i;
  }
  const rosters = clone(state.rosters);
  rosters[p.rosterId] = Object.assign({}, r, { displayOrder });
  return Object.assign({}, state, { rosters });
}

export function resetRoster(state: AppState, p: { rosterId: UUID }): AppState {
  const r = ensureRoster(state, p.rosterId);
  if (!r) return state;
  const rosters = clone(state.rosters);
  rosters[p.rosterId] = Object.assign({}, r, { playersById: {}, displayOrder: {} });
  return Object.assign({}, state, { rosters });
}
