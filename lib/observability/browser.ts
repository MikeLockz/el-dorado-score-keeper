import { getHyperDXConfig, isObservabilityEnabled, type HyperDXConfig } from '@/config/observability';
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

type HyperDXLike = {
  init: (config: {
    apiKey: string;
    service: string;
    url?: string;
    consoleCapture?: boolean;
    debug?: boolean;
  }) => void;
  addAction: (event: string, attributes?: Record<string, unknown>) => void;
  recordException: (error: unknown, attributes?: Record<string, unknown>) => void;
  setGlobalAttributes?: (attributes: Record<string, string>) => void;
  getSessionUrl?: () => string | undefined;
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

const loadHyperDX = async (): Promise<HyperDXLike | null> => {
  if (!isBrowserEnvironment()) {
    return null;
  }
  try {
    const mod = await import('@hyperdx/browser');
    const candidate = (mod && 'default' in mod ? mod.default : mod) as HyperDXLike | undefined;
    if (candidate && typeof candidate.init === 'function') {
      return candidate;
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[observability] Failed to load HyperDX browser SDK; telemetry disabled.', error);
    }
  }
  return null;
};

const createTelemetry = async (): Promise<BrowserTelemetry> => {
  if (!isBrowserTelemetryEnabled()) {
    return noopTelemetry;
  }

  let config: Extract<HyperDXConfig, { runtime: 'browser'; enabled: true }>;
  try {
    const resolved = getHyperDXConfig('browser');
    if (!resolved.enabled) {
      return noopTelemetry;
    }
    config = resolved;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[observability] Browser telemetry misconfigured; HyperDX disabled.', error);
    }
    return noopTelemetry;
  }

  const hyperdx = await loadHyperDX();
  if (!hyperdx) {
    return noopTelemetry;
  }

  try {
    hyperdx.init({
      apiKey: config.apiKey,
      service: config.serviceName,
      url: config.host,
      consoleCapture: true,
      debug: process.env.NODE_ENV !== 'production',
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[observability] HyperDX init failed; telemetry disabled.', error);
    }
    return noopTelemetry;
  }

  if (typeof hyperdx.setGlobalAttributes === 'function') {
    try {
      hyperdx.setGlobalAttributes({
        environment: config.environment,
        service: config.serviceName,
      });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[observability] Failed to set HyperDX global attributes.', error);
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
    const sessionUrl = hyperdx.getSessionUrl?.();
    if (sessionUrl) {
      base.sessionUrl = sessionUrl;
    }
    return base;
  };

  const telemetry: BrowserTelemetry = {
    track: (event, attributes) => {
      try {
        hyperdx.addAction(event, attachEnvironment(attributes));
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
        hyperdx.recordException(error, attachEnvironment(attributes));
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
        hyperdx.addAction('browser.message', payload);
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

export const captureBrowserException = (error: unknown, attributes?: SpanAttributesInput) => {
  if (process.env.NODE_ENV !== 'production') {
    console.error('[observability] exception captured', error, attributes);
  }
  activeTelemetry.captureException(error, attributes);
};

export const captureBrowserMessage = (message: string, options?: BrowserMessageOptions) => {
  const level = options?.level ?? 'info';
  if (process.env.NODE_ENV !== 'production') {
    const logger =
      level === 'warn' ? console.warn : level === 'error' ? console.error : console.info;
    logger?.(`[observability] ${message}`, options?.attributes ?? {});
  }
  activeTelemetry.captureMessage(message, options);
};

export const trackBrowserEvent = (event: string, attributes?: SpanAttributesInput) => {
  activeTelemetry.track(event, attributes);
};

export const __resetBrowserTelemetryForTests = () => {
  activeTelemetry = noopTelemetry;
  initializationPromise = null;
};
