import { z } from 'zod';

const id = z.string().min(1);
const nonEmpty = z.string().min(1);
const round = z.number().int().nonnegative();
const playerId = id;

const roundState = z.enum(['locked', 'bidding', 'playing', 'complete', 'scored']);
const playerType = z.enum(['human', 'bot']);
const suit = z.enum(['clubs', 'diamonds', 'hearts', 'spades']);
const card = z.object({ suit, rank: z.number().int().min(2).max(14) });

export const eventPayloadSchemas = {
  // roster model
  'roster/created': z.object({
    rosterId: id,
    name: nonEmpty,
    type: z.enum(['scorecard', 'single']),
  }),
  'roster/renamed': z.object({ rosterId: id, name: nonEmpty }),
  'roster/activated': z.object({ rosterId: id, mode: z.enum(['scorecard', 'single']) }),
  'roster/player/added': z.object({
    rosterId: id,
    id,
    name: nonEmpty,
    type: playerType.optional(),
  }),
  'roster/player/renamed': z.object({ rosterId: id, id, name: nonEmpty }),
  'roster/player/removed': z.object({ rosterId: id, id }),
  'roster/player/type-set': z.object({ rosterId: id, id, type: playerType }),
  'roster/players/reordered': z.object({ rosterId: id, order: z.array(id) }),
  'roster/reset': z.object({ rosterId: id }),
  'roster/archived': z.object({ rosterId: id }),
  'roster/restored': z.object({ rosterId: id }),
  'roster/deleted': z.object({ rosterId: id }),
  'player/added': z.object({ id, name: nonEmpty, type: playerType.optional() }),
  'player/renamed': z.object({ id, name: nonEmpty }),
  'player/removed': z.object({ id }),
  'player/restored': z.object({ id }),
  'player/type-set': z.object({ id, type: playerType }),
  'players/reordered': z.object({ order: z.array(id) }),
  'player/dropped': z.object({ id, fromRound: round }),
  'player/resumed': z.object({ id, fromRound: round }),
  'score/added': z.object({ playerId, delta: z.number().finite() }),
  'round/state-set': z.object({ round, state: roundState }),
  'bid/set': z.object({ round, playerId, bid: z.number().int().nonnegative() }),
  'made/set': z.object({ round, playerId, made: z.boolean().nullable() }),
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
  'sp/round-tally-set': z.object({
    round,
    tallies: z.record(z.number().int().min(0)),
  }),
} as const;

export type AppEventType = keyof typeof eventPayloadSchemas;

export type EventPayloadByType<T extends AppEventType> = z.infer<(typeof eventPayloadSchemas)[T]>;

export type EventPayloadSchemaMap = typeof eventPayloadSchemas;

export const appEventTypeList = Object.keys(eventPayloadSchemas) as AppEventType[];

export const appEventTypeEnum = z.enum(appEventTypeList as [AppEventType, ...AppEventType[]]);

export const eventEnvelopeSchema = z.object({
  eventId: z.string().min(1),
  ts: z.number().finite(),
  type: z.string().min(1),
  payload: z.unknown(),
});
