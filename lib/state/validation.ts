import { z } from 'zod';
import type { AppEvent, AppEventType, KnownAppEvent, RoundState } from './types';

const uuidLike = z.string().min(1);
const id = z.string().min(1);
const nonEmpty = z.string().min(1);
const round = z.number().int().nonnegative();
const playerId = id;
const ts = z.number().finite();

const roundState: z.ZodType<RoundState> = z.enum([
  'locked',
  'bidding',
  'playing',
  'complete',
  'scored',
]);

// Single-player helpers
const suit = z.enum(['clubs', 'diamonds', 'hearts', 'spades']);
const card = z.object({ suit, rank: z.number().int().min(2).max(14) });

export const payloadSchemas: Record<AppEventType, z.ZodType<unknown>> = {
  // roster model
  'roster/created': z.object({
    rosterId: id,
    name: nonEmpty,
    type: z.enum(['scorecard', 'single']),
  }),
  'roster/renamed': z.object({ rosterId: id, name: nonEmpty }),
  'roster/activated': z.object({ rosterId: id, mode: z.enum(['scorecard', 'single']) }),
  'roster/player/added': z.object({ rosterId: id, id, name: nonEmpty }),
  'roster/player/renamed': z.object({ rosterId: id, id, name: nonEmpty }),
  'roster/player/removed': z.object({ rosterId: id, id }),
  'roster/players/reordered': z.object({ rosterId: id, order: z.array(id) }),
  'roster/reset': z.object({ rosterId: id }),
  'player/added': z.object({ id, name: nonEmpty }),
  'player/renamed': z.object({ id, name: nonEmpty }),
  'player/removed': z.object({ id }),
  'players/reordered': z.object({ order: z.array(id) }),
  'player/dropped': z.object({ id, fromRound: round }),
  'player/resumed': z.object({ id, fromRound: round }),
  'score/added': z.object({ playerId, delta: z.number().finite() }),
  'round/state-set': z.object({ round, state: roundState }),
  'bid/set': z.object({ round, playerId, bid: z.number().int().nonnegative() }),
  'made/set': z.object({ round, playerId, made: z.boolean() }),
  'round/finalize': z.object({ round }),
  // single-player
  'sp/reset': z.object({}),
  'sp/deal': z.object({
    roundNo: round,
    dealerId: id,
    order: z.array(id),
    trump: suit,
    trumpCard: card,
    hands: z.record(z.array(card)),
  }),
  'sp/phase-set': z.object({
    phase: z.enum(['setup', 'bidding', 'playing', 'summary', 'game-summary', 'done']),
  }),
  'sp/trick/played': z.object({ playerId: id, card }),
  'sp/trick/cleared': z.object({ winnerId: id }),
  'sp/trump-broken-set': z.object({ broken: z.boolean() }),
  'sp/leader-set': z.object({ leaderId: id }),
  'sp/trick/reveal-set': z.object({ winnerId: id }),
  'sp/trick/reveal-clear': z.object({}),
  'sp/summary-entered-set': z.object({ at: z.number().int().nonnegative() }),
  'sp/seed-set': z.object({ seed: z.number().int() }),
};

const baseEventShape = z.object({
  eventId: uuidLike,
  type: z.string().min(1),
  payload: z.unknown(),
  ts,
});

export type ValidationFailure = {
  code: 'append.invalid_event_shape' | 'append.unknown_event_type' | 'append.invalid_payload';
  details?: unknown;
};

export function validateEventStrict(e: AppEvent): KnownAppEvent {
  const base = baseEventShape.safeParse(e);
  if (!base.success) {
    const err: ValidationFailure = {
      code: 'append.invalid_event_shape',
      details: base.error.flatten(),
    };
    const ex = Object.assign(new Error('InvalidEventShape'), {
      name: 'InvalidEventShape',
      info: err,
    }) as Error & { info: ValidationFailure };
    throw ex;
  }
  const t = base.data.type;
  if (!(t in payloadSchemas)) {
    const err: ValidationFailure = { code: 'append.unknown_event_type', details: { type: t } };
    const ex = Object.assign(new Error('UnknownEventType'), {
      name: 'UnknownEventType',
      info: err,
    }) as Error & { info: ValidationFailure };
    throw ex;
  }
  const schema = payloadSchemas[t as AppEventType];
  const payload = schema.safeParse(base.data.payload);
  if (!payload.success) {
    const err: ValidationFailure = {
      code: 'append.invalid_payload',
      details: payload.error.flatten(),
    };
    const ex = Object.assign(new Error('InvalidEventPayload'), {
      name: 'InvalidEventPayload',
      info: err,
    }) as Error & { info: ValidationFailure };
    throw ex;
  }
  return { ...base.data, payload: payload.data, type: t as AppEventType } as KnownAppEvent;
}
