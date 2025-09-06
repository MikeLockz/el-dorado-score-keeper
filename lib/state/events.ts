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
  playerAdded: (p: EventPayloadByType<'player/added'>, m?: Meta) => makeEvent('player/added', p, m),
  playerRenamed: (p: EventPayloadByType<'player/renamed'>, m?: Meta) =>
    makeEvent('player/renamed', p, m),
  playerRemoved: (p: EventPayloadByType<'player/removed'>, m?: Meta) =>
    makeEvent('player/removed', p, m),
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
  spTrickPlayed: (p: EventPayloadByType<'sp/trick/played'>, m?: Meta) => makeEvent('sp/trick/played', p, m),
  spTrickCleared: (p: EventPayloadByType<'sp/trick/cleared'>, m?: Meta) => makeEvent('sp/trick/cleared', p, m),
  spTrumpBrokenSet: (p: EventPayloadByType<'sp/trump-broken-set'>, m?: Meta) => makeEvent('sp/trump-broken-set', p, m),
  spLeaderSet: (p: EventPayloadByType<'sp/leader-set'>, m?: Meta) => makeEvent('sp/leader-set', p, m),
};

export type { AppEventType, EventPayloadByType, KnownAppEvent };
