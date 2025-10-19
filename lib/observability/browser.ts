import { getBrowserObservabilityProvider } from '@/config/observability-provider';
import {
  getBrowserTelemetryConfig,
  isObservabilityEnabled,
  type BrowserTelemetryConfig,
} from '@/config/observability';
import { loadBrowserTelemetryAdapter } from '@/lib/observability/vendors/registry';
import type { BrowserTelemetryAdapter } from '@/lib/observability/vendors/types';
import { sanitizeAttributes, type SpanAttributesInput } from '@/lib/observability/spans';
import { assertTelemetryPropertiesSafe } from '@/lib/observability/payload-guard';
import {
  getAnalyticsPreference,
  subscribeToAnalyticsPreference,
  syncAnalyticsPreferenceWithVendor,
  type AnalyticsPreference,
} from '@/lib/observability/privacy';

type BrowserMessageOptions = {
  level?: 'info' | 'warn' | 'error';
  attributes?: SpanAttributesInput;
};

export type BrowserTelemetry = {
  track: (event: string, attributes?: SpanAttributesInput) => void;
  captureException: (error: unknown, attributes?: SpanAttributesInput) => void;
  captureMessage: (message: string, options?: BrowserMessageOptions) => void;
};

const noopTelemetry: BrowserTelemetry = {
  track: () => {},
  captureException: () => {},
  captureMessage: () => {},
};

let activeTelemetry: BrowserTelemetry = noopTelemetry;
let initializationPromise: Promise<BrowserTelemetry> | null = null;

let currentPreference: AnalyticsPreference = 'enabled';
let preferenceSubscriptionInitialised = false;
let preferenceSubscriptionCleanup: (() => void) | null = null;

const isBrowserEnvironment = () => typeof window !== 'undefined';

const resolveErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
};

const initializePreferenceSubscription = () => {
  if (!isBrowserEnvironment()) {
    currentPreference = 'enabled';
    return;
  }

  if (preferenceSubscriptionInitialised) {
    return;
  }

  preferenceSubscriptionInitialised = true;
  currentPreference = getAnalyticsPreference();
  syncAnalyticsPreferenceWithVendor();

  preferenceSubscriptionCleanup = subscribeToAnalyticsPreference((next) => {
    currentPreference = next;
    if (next === 'disabled') {
      activeTelemetry = noopTelemetry;
      initializationPromise = null;
      return;
    }

    initializationPromise = null;
    syncAnalyticsPreferenceWithVendor();
    ensureBrowserTelemetry().catch((error) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[observability] Failed to re-enable browser telemetry after opt-in.', error);
      }
    });
  });
};

const isPreferenceEnabled = () => currentPreference !== 'disabled';

const loadBrowserVendor = async (): Promise<BrowserTelemetryAdapter | null> => {
  if (!isBrowserEnvironment()) {
    return null;
  }

  try {
    const provider = getBrowserObservabilityProvider();
    return await loadBrowserTelemetryAdapter(provider);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[observability] Failed to load browser telemetry vendor.', error);
    }
    return null;
  }
};

const createTelemetry = async (): Promise<BrowserTelemetry> => {
  if (!isBrowserTelemetryEnabled()) {
    return noopTelemetry;
  }

  if (!isPreferenceEnabled()) {
    return noopTelemetry;
  }

  let config: Extract<BrowserTelemetryConfig, { runtime: 'browser'; enabled: true }>;
  try {
    const resolved = getBrowserTelemetryConfig('browser');
    if (!resolved.enabled) {
      return noopTelemetry;
    }
    config = resolved;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[observability] Browser telemetry misconfigured; vendor disabled.', error);
    }
    return noopTelemetry;
  }

  let adapter: BrowserTelemetryAdapter | null;
  const provider = getBrowserObservabilityProvider();

  if (provider === 'newrelic' && !config.newRelic) {
    const mod = await import('@/lib/observability/vendors/newrelic/log-adapter');
    adapter = mod.default;
  } else {
    adapter = await loadBrowserVendor();
  }
  if (!adapter) {
    return noopTelemetry;
  }

  const activeAdapter: BrowserTelemetryAdapter = adapter;

  try {
    const initPayload = {
      apiKey: config.apiKey,
      service: config.serviceName,
      ...(config.host ? { url: config.host } : {}),
      consoleCapture: true,
      debug: Boolean(config.debug ?? (process.env.NODE_ENV !== 'production' && config.newRelic)),
      ...(config.newRelic ? { newRelic: config.newRelic } : {}),
      ...(config.posthog ? { posthog: config.posthog } : {}),
    } as const;

    const initResult = activeAdapter.init(initPayload);
    if (initResult && typeof (initResult as Promise<unknown>).then === 'function') {
      (initResult as Promise<unknown>).catch((error) => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[observability] Browser telemetry vendor init rejected.', error);
        }
      });
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[observability] Browser telemetry vendor init failed; telemetry disabled.',
        error,
      );
    }
    return noopTelemetry;
  }

  if (typeof activeAdapter.setGlobalAttributes === 'function') {
    try {
      activeAdapter.setGlobalAttributes({
        environment: config.environment,
        service: config.serviceName,
        'service.name': config.serviceName,
      });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[observability] Failed to set browser telemetry vendor global attributes.',
          error,
        );
      }
    }
  }

  syncAnalyticsPreferenceWithVendor();

  const attachEnvironment = (attributes?: SpanAttributesInput) => {
    const sanitized = sanitizeAttributes(attributes);
    const base: Record<string, unknown> = {};
    if (sanitized) {
      for (const [key, value] of Object.entries(sanitized)) {
        base[key] = value;
      }
    }
    base.environment = config.environment;
    base.service = config.serviceName;
    base['service.name'] = config.serviceName;
    const sessionUrl = activeAdapter.getSessionUrl?.();
    if (sessionUrl) {
      base.sessionUrl = sessionUrl;
    }
    return base;
  };

  const telemetry: BrowserTelemetry = {
    track: (event, attributes) => {
      if (!isPreferenceEnabled()) {
        return;
      }
      const sanitizedAttributes = sanitizeAttributes(attributes);
      assertTelemetryPropertiesSafe(event, sanitizedAttributes ?? undefined);
      try {
        const payload = attachEnvironment(sanitizedAttributes ?? attributes);
        activeAdapter.addAction(event, payload);
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[observability] Failed to track browser event.', {
            event,
            message: resolveErrorMessage(error),
          });
        }
      }
    },
    captureException: (error, attributes) => {
      if (!isPreferenceEnabled()) {
        return;
      }
      const sanitizedAttributes = sanitizeAttributes(attributes);
      assertTelemetryPropertiesSafe('browser.exception', sanitizedAttributes ?? undefined);
      try {
        const payload = attachEnvironment(sanitizedAttributes ?? attributes);
        activeAdapter.recordException(error, payload);
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[observability] Failed to record browser exception.', {
            message: resolveErrorMessage(err),
          });
        }
      }
    },
    captureMessage: (message, options) => {
      if (!isPreferenceEnabled()) {
        return;
      }
      const level = options?.level ?? 'info';
      const baseAttributes: SpanAttributesInput = {
        message,
        level,
        ...(options?.attributes ?? {}),
      };
      const sanitizedAttributes = sanitizeAttributes(baseAttributes);
      assertTelemetryPropertiesSafe('browser.message', sanitizedAttributes ?? undefined);
      const payload = attachEnvironment(sanitizedAttributes ?? baseAttributes);
      try {
        activeAdapter.addAction('browser.message', payload);
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[observability] Failed to record browser message.', {
            message: resolveErrorMessage(error),
            level,
          });
        }
      }
    },
  };

  return telemetry;
};

export const ensureBrowserTelemetry = async (): Promise<BrowserTelemetry> => {
  initializePreferenceSubscription();

  if (!isPreferenceEnabled()) {
    activeTelemetry = noopTelemetry;
    return noopTelemetry;
  }

  if (activeTelemetry !== noopTelemetry) {
    return activeTelemetry;
  }

  if (!initializationPromise) {
    initializationPromise = createTelemetry()
      .then((telemetry) => {
        activeTelemetry = telemetry;
        return telemetry;
      })
      .finally(() => {
        initializationPromise = null;
      });
  }

  try {
    const telemetry = await initializationPromise;
    if (!isPreferenceEnabled()) {
      activeTelemetry = noopTelemetry;
      return noopTelemetry;
    }
    return telemetry;
  } catch {
    activeTelemetry = noopTelemetry;
    return noopTelemetry;
  }
};

export const isBrowserTelemetryEnabled = () =>
  isBrowserEnvironment() && isObservabilityEnabled('browser');

export const getBrowserTelemetry = () => activeTelemetry;

/**
 * Mirrors captured exceptions to the active browser telemetry adapter while keeping
 * development console output for quick diagnosis during local work.
 */
export const captureBrowserException = (error: unknown, attributes?: SpanAttributesInput) => {
  if (process.env.NODE_ENV !== 'production') {
    console.error('[observability] exception captured', error, attributes);
  }
  activeTelemetry.captureException(error, attributes);
};

/**
 * Records a structured browser message (mapped to New Relic page actions) and logs the
 * payload to the console in non-production environments for visibility.
 */
export const captureBrowserMessage = (message: string, options?: BrowserMessageOptions) => {
  const level = options?.level ?? 'info';
  if (process.env.NODE_ENV !== 'production') {
    const logger =
      level === 'warn' ? console.warn : level === 'error' ? console.error : console.info;
    logger?.(`[observability] ${message}`, options?.attributes ?? {});
  }
  activeTelemetry.captureMessage(message, options);
};

/**
 * Sends a custom telemetry event; the active adapter augments the payload with environment
 * metadata and, for New Relic, SPA route context before forwarding it to the vendor API.
 */
export const trackBrowserEvent = (event: string, attributes?: SpanAttributesInput) => {
  activeTelemetry.track(event, attributes);
};

export const __resetBrowserTelemetryForTests = () => {
  activeTelemetry = noopTelemetry;
  initializationPromise = null;
  preferenceSubscriptionCleanup?.();
  preferenceSubscriptionCleanup = null;
  preferenceSubscriptionInitialised = false;
  currentPreference = 'enabled';
};
