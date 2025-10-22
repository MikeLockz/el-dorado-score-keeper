'use client';

import * as browserObservability from '@/lib/observability/browser';
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

  let trackFn = browserObservability.trackBrowserEvent;

  if (typeof globalThis !== 'undefined') {
    const globalOverride = (globalThis as { __clientLogTrack__?: typeof trackFn })
      .__clientLogTrack__;
    if (typeof globalOverride === 'function') {
      trackFn = globalOverride;
    }
  }

  if (typeof require === 'function') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('./observability/browser') as { trackBrowserEvent?: (type: string, attributes: Record<string, unknown>) => void; default?: { trackBrowserEvent?: (type: string, attributes: Record<string, unknown>) => void } } | undefined;
      const candidate = mod?.trackBrowserEvent ?? mod?.default?.trackBrowserEvent;
      if (typeof candidate === 'function') {
        trackFn = candidate;
      }
    } catch {
      // ignore and fall back to the statically imported tracker
    }
  }

  trackFn(type, attributes);

  if (process.env.NODE_ENV !== 'production') {
    console.info(`[observability] client log: ${type}`, attributes);
  }
}
