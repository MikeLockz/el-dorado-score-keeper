import type { UUID } from '@/lib/state/types';

export type RosterType = 'scorecard' | 'single';

export type Roster = Readonly<{
  name: string;
  playersById: Record<UUID, string>;
  displayOrder: Record<UUID, number>;
  type: RosterType;
  createdAt: number;
}>;

// Placeholder for future operations. Intentionally minimal in Phase 0.
export const rosterVersion = 1;
