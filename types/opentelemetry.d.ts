declare module '@opentelemetry/api' {
  export const SpanStatusCode: Record<string, number>;

  type TelemetrySpan = {
    recordException: (error: unknown) => void;
    setStatus: (status: { code: number; message?: string }) => void;
    setAttribute: (key: string, value: unknown) => void;
    end: () => void;
    name?: string;
  };

  export const trace: {
    getTracer: (name: string) => {
      startActiveSpan: <T>(
        name: string,
        options: { attributes?: Record<string, unknown> } | undefined,
        fn: (span: TelemetrySpan) => T,
      ) => T;
    };
  };
}
