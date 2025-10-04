import type { BrowserTelemetryAdapter } from '@/lib/observability/vendors/types';

const noop = () => {};

export const createNoopBrowserAdapter = (): BrowserTelemetryAdapter => ({
  init: noop,
  addAction: noop,
  recordException: noop,
  setGlobalAttributes: noop,
  getSessionUrl: () => undefined,
});
