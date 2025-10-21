import { uuid } from '@/lib/utils';
import type { AppEventType, EventPayloadByType, KnownAppEvent } from './types';

type Meta = { eventId?: string; ts?: number };

export function makeEvent<T extends AppEventType>(
  type: T,
  payload: EventPayloadByType<T>,
  meta?: Meta,
): KnownAppEvent {
  return {
    type,
    payload,
    eventId: meta?.eventId ?? uuid(),
    ts: meta?.ts ?? Date.now(),
  } as KnownAppEvent;
}

export const events = {
  // roster
  rosterCreated: (p: EventPayloadByType<'roster/created'>, m?: Meta) =>
    makeEvent('roster/created', p, m),
  rosterRenamed: (p: EventPayloadByType<'roster/renamed'>, m?: Meta) =>
    makeEvent('roster/renamed', p, m),
  rosterActivated: (p: EventPayloadByType<'roster/activated'>, m?: Meta) =>
    makeEvent('roster/activated', p, m),
  rosterPlayerAdded: (p: EventPayloadByType<'roster/player/added'>, m?: Meta) =>
    makeEvent('roster/player/added', p, m),
  rosterPlayerRenamed: (p: EventPayloadByType<'roster/player/renamed'>, m?: Meta) =>
    makeEvent('roster/player/renamed', p, m),
  rosterPlayerRemoved: (p: EventPayloadByType<'roster/player/removed'>, m?: Meta) =>
    makeEvent('roster/player/removed', p, m),
  rosterPlayerTypeSet: (p: EventPayloadByType<'roster/player/type-set'>, m?: Meta) =>
    makeEvent('roster/player/type-set', p, m),
  rosterPlayersReordered: (p: EventPayloadByType<'roster/players/reordered'>, m?: Meta) =>
    makeEvent('roster/players/reordered', p, m),
  rosterReset: (p: EventPayloadByType<'roster/reset'>, m?: Meta) => makeEvent('roster/reset', p, m),
  rosterArchived: (p: EventPayloadByType<'roster/archived'>, m?: Meta) =>
    makeEvent('roster/archived', p, m),
  rosterRestored: (p: EventPayloadByType<'roster/restored'>, m?: Meta) =>
    makeEvent('roster/restored', p, m),
  rosterDeleted: (p: EventPayloadByType<'roster/deleted'>, m?: Meta) =>
    makeEvent('roster/deleted', p, m),
  playerAdded: (p: EventPayloadByType<'player/added'>, m?: Meta) => makeEvent('player/added', p, m),
  playerRenamed: (p: EventPayloadByType<'player/renamed'>, m?: Meta) =>
    makeEvent('player/renamed', p, m),
  playerRemoved: (p: EventPayloadByType<'player/removed'>, m?: Meta) =>
    makeEvent('player/removed', p, m),
  playerRestored: (p: EventPayloadByType<'player/restored'>, m?: Meta) =>
    makeEvent('player/restored', p, m),
  playerTypeSet: (p: EventPayloadByType<'player/type-set'>, m?: Meta) =>
    makeEvent('player/type-set', p, m),
  playersReordered: (p: EventPayloadByType<'players/reordered'>, m?: Meta) =>
    makeEvent('players/reordered', p, m),
  playerDropped: (p: EventPayloadByType<'player/dropped'>, m?: Meta) =>
    makeEvent('player/dropped', p, m),
  playerResumed: (p: EventPayloadByType<'player/resumed'>, m?: Meta) =>
    makeEvent('player/resumed', p, m),
  scoreAdded: (p: EventPayloadByType<'score/added'>, m?: Meta) => makeEvent('score/added', p, m),
  roundStateSet: (p: EventPayloadByType<'round/state-set'>, m?: Meta) =>
    makeEvent('round/state-set', p, m),
  bidSet: (p: EventPayloadByType<'bid/set'>, m?: Meta) => makeEvent('bid/set', p, m),
  madeSet: (p: EventPayloadByType<'made/set'>, m?: Meta) => makeEvent('made/set', p, m),
  roundFinalize: (p: EventPayloadByType<'round/finalize'>, m?: Meta) =>
    makeEvent('round/finalize', p, m),
  // single-player
  spReset: (p: EventPayloadByType<'sp/reset'>, m?: Meta) => makeEvent('sp/reset', p, m),
  spDeal: (p: EventPayloadByType<'sp/deal'>, m?: Meta) => makeEvent('sp/deal', p, m),
  spPhaseSet: (p: EventPayloadByType<'sp/phase-set'>, m?: Meta) => makeEvent('sp/phase-set', p, m),
  spTrickPlayed: (p: EventPayloadByType<'sp/trick/played'>, m?: Meta) =>
    makeEvent('sp/trick/played', p, m),
  spTrickCleared: (p: EventPayloadByType<'sp/trick/cleared'>, m?: Meta) =>
    makeEvent('sp/trick/cleared', p, m),
  spTrumpBrokenSet: (p: EventPayloadByType<'sp/trump-broken-set'>, m?: Meta) =>
    makeEvent('sp/trump-broken-set', p, m),
  spLeaderSet: (p: EventPayloadByType<'sp/leader-set'>, m?: Meta) =>
    makeEvent('sp/leader-set', p, m),
  spTrickRevealSet: (p: EventPayloadByType<'sp/trick/reveal-set'>, m?: Meta) =>
    makeEvent('sp/trick/reveal-set', p, m),
  spTrickRevealClear: (p: EventPayloadByType<'sp/trick/reveal-clear'>, m?: Meta) =>
    makeEvent('sp/trick/reveal-clear', p, m),
  spSummaryEnteredSet: (p: EventPayloadByType<'sp/summary-entered-set'>, m?: Meta) =>
    makeEvent('sp/summary-entered-set', p, m),
  spSeedSet: (p: EventPayloadByType<'sp/seed-set'>, m?: Meta) => makeEvent('sp/seed-set', p, m),
  spRoundTallySet: (p: EventPayloadByType<'sp/round-tally-set'>, m?: Meta) =>
    makeEvent('sp/round-tally-set', p, m),
  spHumanSet: (p: EventPayloadByType<'sp/human-set'>, m?: Meta) => makeEvent('sp/human-set', p, m),
};

export type { AppEventType, EventPayloadByType, KnownAppEvent };
