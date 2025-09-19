import { z } from 'zod';
import type { AppEvent, AppEventType, KnownAppEvent } from './types';
import { eventPayloadSchemas, eventEnvelopeSchema } from '@/schema/events';

export const payloadSchemas: Record<AppEventType, z.ZodType<unknown>> = eventPayloadSchemas;

const baseEventShape = eventEnvelopeSchema;

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
