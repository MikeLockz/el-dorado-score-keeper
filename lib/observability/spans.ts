import { SpanStatusCode, trace } from '@opentelemetry/api';

import { isObservabilityEnabled } from '@/config/observability';
import type { ObservabilityRuntime } from '@/config/flags';

type Primitive = string | number | boolean;
type AttributeInput = Primitive | Primitive[] | Date | null | undefined;
export type SpanAttributesInput = Record<string, AttributeInput>;
type SpanAttributeRecord = Record<string, Primitive | Primitive[]>;

type TelemetrySpan = {
  recordException: (error: unknown) => void;
  setStatus: (status: { code: number; message?: string }) => void;
  setAttribute: (key: string, value: Primitive | Primitive[]) => void;
  end: () => void;
  name?: string;
};

type TelemetryTracer = {
  startActiveSpan: <T>(
    name: string,
    options: { attributes?: SpanAttributeRecord },
    fn: (span: TelemetrySpan) => T,
  ) => T;
};

type WithSpanOptions = {
  runtime?: ObservabilityRuntime;
  attributes?: SpanAttributesInput;
};

type SpanErrorLog = {
  span: string;
  message: string;
  name?: string;
  runtime: ObservabilityRuntime;
  attributes?: SpanAttributeRecord;
};

type WithSpanCallback<T> = (span: TelemetrySpan | null) => T | Promise<T>;

const TRACER_NAME = 'el-dorado-domain';

const MAX_STRING_LENGTH = 256;
const MAX_ERROR_MESSAGE_LENGTH = 512;

const resolveSpanStatus = (key: 'ERROR' | 'OK', fallback: number) => {
  const status = (SpanStatusCode as { [status: string]: unknown })[key];
  return typeof status === 'number' ? status : fallback;
};

const SPAN_STATUS = {
  ERROR: resolveSpanStatus('ERROR', 2),
  OK: resolveSpanStatus('OK', 1),
};

let cachedTracer: TelemetryTracer | null = null;
let spanErrorReporter: ((details: SpanErrorLog) => void | Promise<void>) | null = null;

export const setSpanErrorReporter = (
  reporter: ((details: SpanErrorLog) => void | Promise<void>) | null,
) => {
  spanErrorReporter = reporter;
};

const resolveRuntime = (runtime?: ObservabilityRuntime): ObservabilityRuntime =>
  runtime ?? 'browser';

const sanitizeString = (value: string) => value.slice(0, MAX_STRING_LENGTH);

const sanitizePrimitive = (value: unknown): Primitive | undefined => {
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return sanitizeString(value.toISOString());
  }
  return undefined;
};

const sanitizeAttributeValue = (value: AttributeInput): Primitive | Primitive[] | undefined => {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    const sanitized: Primitive[] = [];
    for (const item of value) {
      const primitive = sanitizePrimitive(item);
      if (primitive !== undefined) sanitized.push(primitive);
    }
    return sanitized.length ? sanitized : undefined;
  }
  return sanitizePrimitive(value);
};

export const sanitizeAttributes = (
  attributes?: SpanAttributesInput,
): SpanAttributeRecord | undefined => {
  if (!attributes) return undefined;
  const sanitized: SpanAttributeRecord = {};
  for (const [key, value] of Object.entries(attributes)) {
    const primitive = sanitizeAttributeValue(value);
    if (primitive !== undefined) {
      sanitized[key] = primitive;
    }
  }
  return Object.keys(sanitized).length ? sanitized : undefined;
};

const obtainTracerCandidate = (): TelemetryTracer | null => {
  const api = trace as { getTracer?: (name: string) => unknown };
  if (typeof api.getTracer !== 'function') {
    return null;
  }
  try {
    const candidate = api.getTracer(TRACER_NAME);
    if (
      candidate &&
      typeof (candidate as { startActiveSpan?: unknown }).startActiveSpan === 'function'
    ) {
      return candidate as TelemetryTracer;
    }
  } catch {}
  return null;
};

const getTracer = (): TelemetryTracer | null => {
  if (cachedTracer) return cachedTracer;
  cachedTracer = obtainTracerCandidate();
  return cachedTracer;
};

const shouldInstrument = (runtime: ObservabilityRuntime) => isObservabilityEnabled(runtime);

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      message: sanitizeString(error.message || 'Unknown error').slice(0, MAX_ERROR_MESSAGE_LENGTH),
      name: error.name,
    };
  }
  if (typeof error === 'string') {
    return {
      message: sanitizeString(error).slice(0, MAX_ERROR_MESSAGE_LENGTH),
      name: 'Error',
    };
  }
  return {
    message: 'Unknown error',
    name: 'Error',
  };
};

const emitSpanErrorLog = (details: SpanErrorLog) => {
  if (spanErrorReporter) {
    try {
      const result = spanErrorReporter(details);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<unknown>).catch((error) => {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[observability] span error reporter rejected', error);
          }
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[observability] span error reporter failed', error);
      }
    }
    return;
  }

  if (typeof window !== 'undefined') {
    void import('@/lib/client-log')
      .then(({ logEvent }) => {
        const payload: SpanAttributesInput = {
          span: details.span,
          message: details.message,
          runtime: details.runtime,
        };
        if (details.name) {
          payload.name = details.name;
        }
        if (details.attributes) {
          try {
            payload.attributes = JSON.stringify(details.attributes);
          } catch {
            payload.attributes = '[unserializable]';
          }
        }
        logEvent('observability-span-error', payload);
      })
      .catch(() => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[observability] Failed to emit client span error log');
        }
      });
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn('[observability] Span error captured outside the browser runtime.', details);
  }
};

const assignAttributes = (span: TelemetrySpan, attributes?: SpanAttributeRecord) => {
  if (!attributes) return;
  for (const [key, value] of Object.entries(attributes)) {
    try {
      span.setAttribute(key, value);
    } catch {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[observability] Failed to set span attribute ${key}`);
      }
    }
  }
};

const isPromise = <TValue>(value: unknown): value is Promise<TValue> =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { then?: unknown }).then === 'function';

export const recordSpanError = (
  span: TelemetrySpan | null | undefined,
  error: unknown,
  attributes?: SpanAttributesInput,
  options?: { spanName?: string; runtime?: ObservabilityRuntime },
) => {
  const runtime = resolveRuntime(options?.runtime);
  const normalizedError = normalizeError(error);
  const sanitizedAttributes = sanitizeAttributes(attributes);

  if (span) {
    try {
      span.recordException(normalizedError);
      span.setStatus({ code: SPAN_STATUS.ERROR, message: normalizedError.message });
      span.setAttribute('error.message', normalizedError.message);
      if (normalizedError.name) {
        span.setAttribute('error.name', normalizedError.name);
      }
      assignAttributes(span, sanitizedAttributes);
    } catch {
      // Ignore span recording failures.
    }
  }

  emitSpanErrorLog({
    span: options?.spanName ?? span?.name ?? 'unknown-span',
    message: normalizedError.message,
    name: normalizedError.name,
    runtime,
    ...(sanitizedAttributes ? { attributes: sanitizedAttributes } : {}),
  });
};

const invokeCallback = <T>(
  span: TelemetrySpan | null,
  name: string,
  runtime: ObservabilityRuntime,
  callback: WithSpanCallback<T>,
  attributes?: SpanAttributesInput,
): T | Promise<T> => {
  try {
    const result = callback(span);
    return result;
  } catch (error) {
    recordSpanError(span, error, attributes, { spanName: name, runtime });
    throw error;
  }
};

export function withSpan<T>(
  name: string,
  callback: WithSpanCallback<T>,
  options?: WithSpanOptions,
): T | Promise<T>;

export function withSpan<T>(
  name: string,
  attributes: SpanAttributesInput,
  callback: WithSpanCallback<T>,
  options?: WithSpanOptions,
): T | Promise<T>;

export function withSpan<T>(
  name: string,
  attributesOrCallback: SpanAttributesInput | WithSpanCallback<T>,
  maybeCallback?: WithSpanCallback<T> | WithSpanOptions,
  maybeOptions?: WithSpanOptions,
): T | Promise<T> {
  let attributes: SpanAttributesInput | undefined;
  let callback: WithSpanCallback<T> | undefined;
  let options: WithSpanOptions | undefined;

  if (typeof attributesOrCallback === 'function') {
    callback = attributesOrCallback;
    options = (maybeCallback as WithSpanOptions | undefined) ?? undefined;
  } else {
    attributes = attributesOrCallback;
    if (typeof maybeCallback === 'function') {
      callback = maybeCallback;
      options = maybeOptions;
    }
  }

  if (!callback) {
    throw new Error('withSpan requires a callback function');
  }

  const executeCallback = callback;
  const resolvedOptions = options ?? {};
  const runtime = resolveRuntime(resolvedOptions.runtime);
  const attributeInput = resolvedOptions.attributes ?? attributes;
  const sanitizedAttributes = sanitizeAttributes(attributeInput);

  if (!shouldInstrument(runtime)) {
    return executeCallback(null);
  }

  const tracer = getTracer();
  if (!tracer) {
    return executeCallback(null);
  }

  const spanOptions = sanitizedAttributes ? { attributes: sanitizedAttributes } : {};
  return tracer.startActiveSpan(name, spanOptions, (span) => {
    const result = invokeCallback(span, name, runtime, executeCallback, attributeInput);
    if (isPromise<T>(result)) {
      return result
        .then((value) => {
          span.setStatus({ code: SPAN_STATUS.OK });
          span.end();
          return value;
        })
        .catch((error) => {
          recordSpanError(span, error, attributeInput, { spanName: name, runtime });
          span.end();
          throw error;
        });
    }

    span.setStatus({ code: SPAN_STATUS.OK });
    span.end();
    return result;
  });
}

export const withSpanSync = <T>(
  name: string,
  attributes: SpanAttributesInput,
  callback: (span: TelemetrySpan | null) => T,
  options?: WithSpanOptions,
): T => {
  const result = withSpan(name, attributes, callback, options);
  if (isPromise(result)) {
    throw new Error('withSpanSync received an asynchronous callback result');
  }
  return result;
};
