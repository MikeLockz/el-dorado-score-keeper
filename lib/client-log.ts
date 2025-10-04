'use client';

import { trackBrowserEvent } from '@/lib/observability/browser';
import type { SpanAttributesInput } from '@/lib/observability/spans';

const resolvePath = () => {
  if (typeof window === 'undefined') {
    return 'unknown';
  }
  return `${location.pathname}${location.search}`;
};

const buildTelemetryAttributes = (
  path: string,
  extra?: SpanAttributesInput,
): SpanAttributesInput => ({
  path,
  ...(extra ?? {}),
});

export function logEvent(type: string, extra?: SpanAttributesInput) {
  const path = resolvePath();
  const attributes = buildTelemetryAttributes(path, extra);

  trackBrowserEvent(type, attributes);

  if (process.env.NODE_ENV !== 'production') {
    console.info(`[observability] client log: ${type}`, attributes);
  }
}
