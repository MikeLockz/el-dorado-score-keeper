import posthog, { type PostHog, type PostHogConfig } from 'posthog-js';

import {
  type BrowserTelemetryAdapter,
  type BrowserVendorInitConfig,
} from '@/lib/observability/vendors/types';
import { sanitizeAttributes, type SpanAttributesInput } from '@/lib/observability/spans';

let client: PostHog | null = null;
let bootstrapped = false;
let cachedGlobals: Record<string, string> = {};
let initializedService: string | null = null;

const isBrowser = () => typeof window !== 'undefined';

const applyGlobals = (attributes: Record<string, string>) => {
  cachedGlobals = {
    ...cachedGlobals,
    ...attributes,
  };

  if (!Object.keys(cachedGlobals).length) {
    return;
  }

  if (client) {
    try {
      client.register({ ...cachedGlobals });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[analytics] Failed to register PostHog globals.', error);
      }
    }
  }
};

const mapEventName = (event: string) => (event === 'page.viewed' ? '$pageview' : event);

const resolveClient = () => {
  if (!isBrowser()) {
    return null;
  }
  return client;
};

const resolveInstance = ():
  | (PostHog & {
      opt_out_capturing?: () => void;
      opt_in_capturing?: () => void;
    })
  | null => {
  if (!isBrowser()) return null;
  if (client) return client;
  return (posthog as unknown as PostHog | null) ?? null;
};

const resolveAdapterConfig = (
  config: BrowserVendorInitConfig,
): { apiKey: string; host?: string; debug: boolean } | null => {
  const apiKey = config.posthog?.apiKey ?? config.apiKey;
  if (!apiKey) {
    return null;
  }

  const debug = Boolean(config.posthog?.debug ?? config.debug);

  const init: { apiKey: string; host?: string; debug: boolean } = { apiKey, debug };
  const host = config.posthog?.host ?? config.url;
  if (typeof host === 'string' && host.length > 0) {
    init.host = host;
  }

  return init;
};

const toCaptureProperties = (attributes?: Record<string, unknown>) => {
  const sanitized = sanitizeAttributes(attributes as SpanAttributesInput | undefined);
  return sanitized ? { ...sanitized } : {};
};

const resolveErrorPayload = (error: unknown) => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  return { message: 'Unknown error' };
};

const adapter: BrowserTelemetryAdapter = {
  init(config: BrowserVendorInitConfig) {
    if (!isBrowser() || bootstrapped) {
      return;
    }

    initializedService = config.service;

    const resolved = resolveAdapterConfig(config);
    if (!resolved) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[analytics] Missing PostHog credentials; adapter not initialised.');
      }
      return;
    }

    try {
      const initOptions: Partial<PostHogConfig> = {
        capture_pageview: false,
        autocapture: false,
        disable_session_recording: true,
        persistence: 'localStorage',
        property_blacklist: ['$ip'],
        debug: resolved.debug,
        loaded(instance) {
          client = instance;
          if (initializedService && !cachedGlobals.app) {
            applyGlobals({ app: initializedService });
          } else if (Object.keys(cachedGlobals).length) {
            applyGlobals({});
          }
        },
      };

      if (resolved.host) {
        initOptions.api_host = resolved.host;
      }

      posthog.init(resolved.apiKey, initOptions);

      client = posthog;
      if (initializedService && !cachedGlobals.app) {
        applyGlobals({ app: initializedService });
      }
      bootstrapped = true;
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[analytics] Failed to initialise PostHog adapter.', error);
      }
    }
  },

  setGlobalAttributes(attributes: Record<string, string>) {
    if (!attributes) return;
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (typeof value === 'string' && value.trim().length) {
        next[key] = value;
      }
    }
    if (initializedService && !next.app) {
      next.app = initializedService;
    }
    if (!Object.keys(next).length) {
      return;
    }
    applyGlobals(next);
  },

  addAction(event: string, attributes?: Record<string, unknown>) {
    const active = resolveClient();
    if (!active) {
      return;
    }
    const name = mapEventName(event);
    const properties = toCaptureProperties(attributes);
    try {
      active.capture(name, properties);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[analytics] Failed to capture PostHog event.', {
          event: name,
          error,
        });
      }
    }
  },

  recordException(error: unknown, attributes?: Record<string, unknown>) {
    const active = resolveClient();
    if (!active) {
      return;
    }
    const properties = {
      ...resolveErrorPayload(error),
      ...toCaptureProperties(attributes),
    };
    try {
      active.capture('browser.exception', properties);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[analytics] Failed to capture PostHog exception.', err);
      }
    }
  },

  getSessionUrl() {
    const active = resolveClient();
    if (!active) {
      return undefined;
    }
    try {
      const url = active.get_session_replay_url?.();
      return typeof url === 'string' && url.length ? url : undefined;
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[analytics] Failed to read PostHog session URL.', error);
      }
      return undefined;
    }
  },
};

export default adapter;

export const syncOptOut = (preference: 'enabled' | 'disabled') => {
  const instance = resolveInstance();
  if (!instance) return;

  try {
    if (preference === 'disabled') {
      instance.opt_out_capturing?.();
    } else {
      instance.opt_in_capturing?.();
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[analytics] Failed to sync PostHog opt-out state.', error);
    }
  }
};
