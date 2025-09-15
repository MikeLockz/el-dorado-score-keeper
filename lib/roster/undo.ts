import type { AppState, UUID } from '@/lib/state/types';

type Snapshot = Readonly<{
  rosterId: UUID;
  playersById: Record<string, string>;
  displayOrder: Record<string, number>;
}>;

const stacks = new Map<UUID, Snapshot[]>();
const MAX_DEPTH = 10;

export function push(state: AppState, rosterId: UUID): void {
  const r = state.rosters[rosterId];
  if (!r) return;
  const snap: Snapshot = {
    rosterId,
    playersById: { ...r.playersById },
    displayOrder: { ...r.displayOrder },
  };
  const arr = stacks.get(rosterId) ?? [];
  arr.push(snap);
  if (arr.length > MAX_DEPTH) arr.shift();
  stacks.set(rosterId, arr);
}

export function canUndo(rosterId: UUID): boolean {
  const arr = stacks.get(rosterId) ?? [];
  return arr.length > 0;
}

export function undo(state: AppState, rosterId: UUID): AppState {
  const r = state.rosters[rosterId];
  if (!r) return state;
  const arr = stacks.get(rosterId) ?? [];
  const snap = arr.pop();
  if (!snap) return state;
  stacks.set(rosterId, arr);
  const rosters = Object.assign({}, state.rosters);
  rosters[rosterId] = Object.assign({}, r, {
    playersById: { ...snap.playersById },
    displayOrder: { ...snap.displayOrder },
  });
  return Object.assign({}, state, { rosters });
}
