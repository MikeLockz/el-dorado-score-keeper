import { z } from 'zod';

const DEFAULT_BROWSER_PROVIDER = 'newrelic' as const;

const BrowserProviderSchema = z.enum(['newrelic', 'posthog', 'custom']);

export type BrowserObservabilityProvider = z.infer<typeof BrowserProviderSchema>;

const normalizeProvider = (value: string | undefined) => value?.trim().toLowerCase() ?? '';

export const getBrowserObservabilityProvider = (): BrowserObservabilityProvider => {
  const normalized = normalizeProvider(process.env.NEXT_PUBLIC_OBSERVABILITY_PROVIDER);
  if (!normalized) {
    return DEFAULT_BROWSER_PROVIDER;
  }

  const parsed = BrowserProviderSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[observability] Unknown browser telemetry provider "${normalized}"; using ${DEFAULT_BROWSER_PROVIDER}.`,
    );
  }

  return DEFAULT_BROWSER_PROVIDER;
};

export const isCustomBrowserProvider = () => getBrowserObservabilityProvider() === 'custom';
