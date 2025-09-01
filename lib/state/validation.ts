import { z } from 'zod'
import type { AppEvent, AppEventType, KnownAppEvent, RoundState } from './types'

const uuidLike = z.string().min(1)
const id = z.string().min(1)
const nonEmpty = z.string().min(1)
const round = z.number().int().nonnegative()
const playerId = id
const ts = z.number().finite()

const roundState: z.ZodType<RoundState> = z.enum(['locked', 'bidding', 'complete', 'scored'])

export const payloadSchemas: Record<AppEventType, z.ZodType<any>> = {
  'player/added': z.object({ id, name: nonEmpty }),
  'player/renamed': z.object({ id, name: nonEmpty }),
  'player/removed': z.object({ id }),
  'score/added': z.object({ playerId, delta: z.number().finite() }),
  'round/state-set': z.object({ round, state: roundState }),
  'bid/set': z.object({ round, playerId, bid: z.number().int().nonnegative() }),
  'made/set': z.object({ round, playerId, made: z.boolean() }),
  'round/finalize': z.object({ round }),
}

const baseEventShape = z.object({
  eventId: uuidLike,
  type: z.string().min(1),
  payload: z.unknown(),
  ts,
})

export type ValidationFailure = {
  code: 'append.invalid_event_shape' | 'append.unknown_event_type' | 'append.invalid_payload'
  details?: unknown
}

export function validateEventStrict(e: AppEvent): KnownAppEvent {
  const base = baseEventShape.safeParse(e)
  if (!base.success) {
    const err: ValidationFailure = { code: 'append.invalid_event_shape', details: base.error.flatten() }
    const ex = new Error('InvalidEventShape')
    ;(ex as any).name = 'InvalidEventShape'
    ;(ex as any).info = err
    throw ex
  }
  const t = base.data.type as string
  if (!(t in payloadSchemas)) {
    const err: ValidationFailure = { code: 'append.unknown_event_type', details: { type: t } }
    const ex = new Error('UnknownEventType')
    ;(ex as any).name = 'UnknownEventType'
    ;(ex as any).info = err
    throw ex
  }
  const schema = payloadSchemas[t as AppEventType]
  const payload = schema.safeParse(base.data.payload)
  if (!payload.success) {
    const err: ValidationFailure = { code: 'append.invalid_payload', details: payload.error.flatten() }
    const ex = new Error('InvalidEventPayload')
    ;(ex as any).name = 'InvalidEventPayload'
    ;(ex as any).info = err
    throw ex
  }
  return { ...base.data, payload: payload.data, type: t as AppEventType } as KnownAppEvent
}

