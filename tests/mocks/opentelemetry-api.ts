export const SpanStatusCode = {
  ERROR: 2,
  OK: 1,
} as const;

const noopSpan = {
  recordException: () => {},
  setStatus: () => {},
  setAttribute: () => {},
  end: () => {},
};

const tracer = {
  startActiveSpan: <T>(name: string, _options: unknown, fn: (span: typeof noopSpan) => T): T => {
    return fn({ ...noopSpan, name });
  },
};

export const trace = {
  getTracer: () => tracer,
};
