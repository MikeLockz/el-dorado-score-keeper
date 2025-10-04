import type { BrowserObservabilityProvider } from '@/config/observability-provider';
import { createNoopBrowserAdapter } from '@/lib/observability/vendors/noop-adapter';
import type { BrowserTelemetryAdapter, BrowserVendorLoader } from '@/lib/observability/vendors/types';

const createLoader = (loader: BrowserVendorLoader): BrowserVendorLoader => loader;

const registry: Record<BrowserObservabilityProvider, BrowserVendorLoader> = {
  newrelic: createLoader(async () => {
    const mod = await import('@obs/browser-vendor/newrelic/browser-agent');
    const candidate = (mod && 'default' in mod ? mod.default : mod) as
      | BrowserTelemetryAdapter
      | undefined;
    if (candidate && typeof candidate.init === 'function') {
      return candidate;
    }
    return createNoopBrowserAdapter();
  }),
  custom: createLoader(async () => {
    try {
      const mod = await import('@obs/browser-vendor/custom');
      const candidate = (mod && 'default' in mod ? mod.default : mod) as
        | BrowserTelemetryAdapter
        | undefined;
      if (candidate && typeof candidate.init === 'function') {
        return candidate;
      }
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[observability] Custom browser telemetry adapter missing or invalid.');
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[observability] Failed to load custom browser telemetry adapter.', error);
      }
    }
    return createNoopBrowserAdapter();
  }),
};

export const loadBrowserTelemetryAdapter = async (
  provider: BrowserObservabilityProvider,
): Promise<BrowserTelemetryAdapter> => {
  const loader = registry[provider];
  if (!loader) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[observability] Unknown browser telemetry provider "${provider}".`);
    }
    return createNoopBrowserAdapter();
  }
  return loader();
};
