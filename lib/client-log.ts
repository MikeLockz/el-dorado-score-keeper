'use client';

import { trackBrowserEvent } from '@/lib/observability/browser';

const resolvePath = () => {
  if (typeof window === 'undefined') {
    return 'unknown';
  }
  return `${location.pathname}${location.search}`;
};

const buildTelemetryAttributes = (
  path: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> => ({
  path,
  ...(extra ?? {}),
});

export function logEvent(type: string, extra?: Record<string, unknown>) {
  const path = resolvePath();
  const attributes = buildTelemetryAttributes(path, extra);

  trackBrowserEvent(type, attributes);

  if (process.env.NODE_ENV !== 'production') {
    console.info(`[observability] client log: ${type}`, attributes);
  }
}
