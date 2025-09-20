import type { Rank, Suit } from '@/lib/single-player/types';
import {
  type AppEventType as CatalogEventType,
  type EventPayloadByType as CatalogPayload,
} from '@/schema/events';
import { initialRounds } from './logic';

export type UUID = string;

export type AppEventType = CatalogEventType;
export type EventMap = { [K in AppEventType]: CatalogPayload<K> };
export type EventPayloadByType<T extends AppEventType> = CatalogPayload<T>;

export type KnownAppEvent<T extends AppEventType = AppEventType> = {
  eventId: UUID;
  type: T;
  payload: EventPayloadByType<T>;
  ts: number;
};

// Backward-compatible input event type (accept unknown custom events too)
export type AppEvent =
  | KnownAppEvent
  | { eventId: UUID; type: string; payload: unknown; ts: number };

export type RoundState = EventPayloadByType<'round/state-set'>['state'];

export type RoundData = Readonly<{
  state: RoundState;
  bids: Record<string, number>;
  made: Record<string, boolean | null>;
  // If present[pid] === false, player is absent for the round. Missing implies present.
  present?: Record<string, boolean>;
}>;

export type PlayerDetail = Readonly<{
  name: string;
  type: 'human' | 'bot';
  archived: boolean;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}>;

export type AppState = Readonly<{
  players: Record<string, string>;
  playerDetails: Record<string, PlayerDetail>;
  scores: Record<string, number>;
  rounds: Record<number, RoundData>;
  // Roster model (introduced alongside legacy players/display_order)
  rosters: Record<
    UUID,
    Readonly<{
      name: string;
      playersById: Record<UUID, string>;
      playerTypesById: Record<UUID, 'human' | 'bot'>;
      displayOrder: Record<UUID, number>;
      type: 'scorecard' | 'single';
      createdAt: number;
      archivedAt?: number | null;
    }>
  >;
  activeScorecardRosterId: UUID | null;
  activeSingleRosterId: UUID | null;
  humanByMode?: { single?: string | null };
  sp: Readonly<{
    phase: 'setup' | 'bidding' | 'playing' | 'summary' | 'game-summary' | 'done';
    roundNo: number | null;
    dealerId: string | null;
    order: string[];
    trump: Suit | null;
    trumpCard: { suit: Suit; rank: Rank } | null;
    hands: Record<string, Array<{ suit: Suit; rank: Rank }>>;
    trickPlays: Array<{
      playerId: string;
      card: { suit: Suit; rank: Rank };
    }>;
    trickCounts: Record<string, number>;
    trumpBroken: boolean;
    leaderId: string | null;
    reveal: { winnerId: string } | null;
    handPhase: 'idle' | 'revealing';
    lastTrickSnapshot: Readonly<{
      ledBy: string;
      plays: ReadonlyArray<{
        playerId: string;
        card: { suit: Suit; rank: Rank };
      }>;
      winnerId: string;
    }> | null;
    summaryEnteredAt?: number;
    sessionSeed?: number | null;
    roundTallies?: Record<number, Record<string, number>>;
  }>;
  // Optional dense display order per player ID. Missing entries are handled by selectors.
  display_order: Record<string, number>;
}>;

export const INITIAL_STATE: AppState = {
  players: {},
  playerDetails: {},
  scores: {},
  rounds: initialRounds(),
  rosters: {},
  activeScorecardRosterId: null,
  activeSingleRosterId: null,
  humanByMode: {},
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
    handPhase: 'idle',
    lastTrickSnapshot: null,
    sessionSeed: null,
    roundTallies: {},
  },
  display_order: {},
};

export { reduce } from './reducer';
