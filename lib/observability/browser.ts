import { getBrowserObservabilityProvider } from '@/config/observability-provider';
import {
  getBrowserTelemetryConfig,
  isObservabilityEnabled,
  type BrowserTelemetryConfig,
} from '@/config/observability';
import { loadBrowserTelemetryAdapter } from '@/lib/observability/vendors/registry';
import type { BrowserTelemetryAdapter } from '@/lib/observability/vendors/types';
import { sanitizeAttributes, type SpanAttributesInput } from '@/lib/observability/spans';

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

const isBrowserEnvironment = () => typeof window !== 'undefined';

const resolveErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
};

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

  let adapter: BrowserTelemetryAdapter;
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

  try {
    const initPayload = {
      apiKey: config.apiKey,
      service: config.serviceName,
      url: config.host,
      consoleCapture: true,
      debug: process.env.NODE_ENV !== 'production' && Boolean(config.newRelic),
      ...(config.newRelic ? { newRelic: config.newRelic } : {}),
    } as const;

    const initResult = adapter.init(initPayload);
    if (initResult && typeof (initResult as Promise<unknown>).then === 'function') {
      (initResult as Promise<unknown>).catch((error) => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[observability] Browser telemetry vendor init rejected.', error);
        }
      });
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[observability] Browser telemetry vendor init failed; telemetry disabled.', error);
    }
    return noopTelemetry;
  }

  if (typeof adapter.setGlobalAttributes === 'function') {
    try {
      adapter.setGlobalAttributes({
        environment: config.environment,
        service: config.serviceName,
      });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[observability] Failed to set browser telemetry vendor global attributes.', error);
      }
    }
  }

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
    const sessionUrl = adapter.getSessionUrl?.();
    if (sessionUrl) {
      base.sessionUrl = sessionUrl;
    }
    return base;
  };

  const telemetry: BrowserTelemetry = {
    track: (event, attributes) => {
      try {
        adapter.addAction(event, attachEnvironment(attributes));
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
      try {
        adapter.recordException(error, attachEnvironment(attributes));
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[observability] Failed to record browser exception.', {
            message: resolveErrorMessage(err),
          });
        }
      }
    },
    captureMessage: (message, options) => {
      const level = options?.level ?? 'info';
      const payload = attachEnvironment({
        message,
        level,
        ...(options?.attributes ?? {}),
      });
      try {
        adapter.addAction('browser.message', payload);
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
    return await initializationPromise;
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
};
