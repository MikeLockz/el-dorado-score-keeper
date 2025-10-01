import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Span } from '@opentelemetry/api';

const ORIGINAL_ENV = { ...process.env };

const trackedEnvKeys = ['NEXT_PUBLIC_OBSERVABILITY_ENABLED'];

const restoreEnv = () => {
  for (const key of trackedEnvKeys) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

beforeEach(() => {
  restoreEnv();
});

afterEach(() => {
  restoreEnv();
  vi.resetModules();
  vi.clearAllMocks();
  delete (globalThis as { window?: unknown }).window;
});

describe('withSpan', () => {
  it('short-circuits when observability is disabled', async () => {
    const startActiveSpan = vi.fn();

    vi.doMock('@opentelemetry/api', () => ({
      trace: {
        getTracer: () => ({ startActiveSpan }),
      },
      SpanStatusCode: { ERROR: 2, OK: 1, UNSET: 0 },
    }));

    const callback = vi.fn().mockReturnValue('ok');

    const { withSpan, setSpanErrorReporter } = await import('@/lib/observability/spans');

    const result = withSpan('test-span', callback);

    expect(result).toBe('ok');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(null);
    expect(startActiveSpan).not.toHaveBeenCalled();
  });

  it('registers a span when enabled and resolves synchronously', async () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';

    let spanMock: {
      setStatus: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
      setAttribute: ReturnType<typeof vi.fn>;
    };

    const startActiveSpan = vi.fn(
      (_name: string, options: unknown, run: (span: unknown) => unknown) => run(spanMock),
    );

    vi.doMock('@opentelemetry/api', () => {
      spanMock = {
        setStatus: vi.fn(),
        end: vi.fn(),
        setAttribute: vi.fn(),
      };
      return {
        trace: {
          getTracer: () => ({ startActiveSpan }),
        },
        SpanStatusCode: { ERROR: 2, OK: 1, UNSET: 0 },
      };
    });

    const callback = vi.fn().mockImplementation((span) => {
      span?.setAttribute?.('round', 3);
      return 'done';
    });

    const { withSpan } = await import('@/lib/observability/spans');

    const result = withSpan('state.finalize-round', { round: 3 }, callback);

    expect(result).toBe('done');
    expect(startActiveSpan).toHaveBeenCalledTimes(1);
    expect(startActiveSpan.mock.calls[0]?.[0]).toBe('state.finalize-round');
    expect(startActiveSpan.mock.calls[0]?.[1]).toMatchObject({ attributes: { round: 3 } });
    expect(spanMock.setStatus).toHaveBeenCalledWith({ code: 1 });
    expect(spanMock.end).toHaveBeenCalledTimes(1);
  });

  it('records span errors, sanitizes attributes, and logs structure', async () => {
    const clientLogSpy = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const spanMock = {
      setStatus: vi.fn(),
      end: vi.fn(),
      recordException: vi.fn(),
      setAttribute: vi.fn(),
      name: 'state.finalize-round',
    } as unknown as Span;

    const { recordSpanError, setSpanErrorReporter } = await import('@/lib/observability/spans');

    setSpanErrorReporter((details) => {
      clientLogSpy(details);
    });

    const error = new Error('data load failed');

    recordSpanError(
      spanMock,
      error,
      { round: 4, metadata: { nested: true } as unknown as number },
      {
        spanName: 'state.finalize-round',
        runtime: 'browser',
      },
    );

    expect(spanMock.recordException).toHaveBeenCalledTimes(1);
    expect(spanMock.setStatus).toHaveBeenCalledWith({ code: 2, message: 'data load failed' });
    expect(spanMock.setAttribute).toHaveBeenCalledWith('error.message', 'data load failed');

    expect(clientLogSpy).toHaveBeenCalledWith({
      span: 'state.finalize-round',
      message: 'data load failed',
      name: 'Error',
      runtime: 'browser',
      attributes: { round: 4 },
    });

    setSpanErrorReporter(null);
    warnSpy.mockRestore();
  });
});
