import logAdapter from '@/lib/observability/vendors/newrelic/log-adapter';
import type {
  BrowserTelemetryAdapter,
  BrowserVendorInitConfig,
  NewRelicBrowserAgentConfig,
} from '@/lib/observability/vendors/types';

const DEFAULT_BEACON_HOST = 'bam.nr-data.net';

// Minimal shape of the New Relic browser agent API we interact with.
type NewRelicInteractionHandle = {
  setName?: (name: string) => void;
};

type NewRelicBrowserAgent = {
  addPageAction?: (name: string, attributes?: Record<string, unknown>) => void;
  noticeError?: (error: Error, attributes?: Record<string, unknown>) => void;
  setCustomAttribute?: (name: string, value: unknown) => void;
  interaction?: () => NewRelicInteractionHandle | null | undefined;
};

type PendingInvocation = (agent: NewRelicBrowserAgent | null) => void;

type InstrumentedWindow = Window & {
  newrelic?: NewRelicBrowserAgent;
  NREUM?: {
    init?: Record<string, unknown>;
    loader_config?: Record<string, unknown>;
    info?: Record<string, unknown>;
  };
};

let agentPromise: Promise<NewRelicBrowserAgent | null> | null = null;
let resolvedAgent: NewRelicBrowserAgent | null = null;
let fallbackActive = false;
let fallbackInitialized = false;
let lastInitConfig: BrowserVendorInitConfig | null = null;
let pendingInvocations: PendingInvocation[] = [];
let globalAttributes: Record<string, string> = {};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const coerceString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const setAgentAttribute = (agent: NewRelicBrowserAgent, key: string, value: unknown) => {
  if (value === undefined || !agent.setCustomAttribute) {
    return;
  }
  try {
    agent.setCustomAttribute(key, value);
  } catch (error) {
    if (lastInitConfig?.debug) {
      console.warn('[observability] Failed to set New Relic custom attribute.', {
        key,
        value,
        error,
      });
    }
  }
};

const applyRouteMetadata = (
  agent: NewRelicBrowserAgent,
  attributes: Record<string, unknown>,
) => {
  const path = coerceString(attributes.path);
  const pathname = coerceString(attributes.pathname);
  const search = coerceString(attributes.search);
  const title = coerceString(attributes.title);
  const referrer = coerceString(attributes.referrer);

  const routeName = path ?? pathname;

  setAgentAttribute(agent, 'route.name', routeName ?? pathname);
  setAgentAttribute(agent, 'route.pathname', pathname);
  setAgentAttribute(agent, 'route.search', search);
  setAgentAttribute(agent, 'page.url', path ?? (pathname && search ? `${pathname}?${search}` : pathname));
  setAgentAttribute(agent, 'page.title', title);
  setAgentAttribute(agent, 'page.referrer', referrer);

  if (typeof agent.interaction === 'function') {
    try {
      const interaction = agent.interaction();
      interaction?.setName?.(pathname ?? routeName ?? 'page.viewed');
    } catch (error) {
      if (lastInitConfig?.debug) {
        console.warn('[observability] Failed to update New Relic interaction name.', error);
      }
    }
  }
};

const getInstrumentedWindow = (): InstrumentedWindow | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return window as InstrumentedWindow;
};

const ensureFallback = () => {
  if (fallbackInitialized || !lastInitConfig) {
    return;
  }

  fallbackInitialized = true;
  logAdapter.init(lastInitConfig);
  if (Object.keys(globalAttributes).length && typeof logAdapter.setGlobalAttributes === 'function') {
    logAdapter.setGlobalAttributes(globalAttributes);
  }
};

const drainPendingInvocations = () => {
  if (!pendingInvocations.length) {
    return;
  }

  const queue = pendingInvocations;
  pendingInvocations = [];
  const agent = resolvedAgent;
  if (fallbackActive || !agent) {
    ensureFallback();
    queue.forEach((callback) => {
      try {
        callback(null);
      } catch (error) {
        if (lastInitConfig?.debug) {
          console.warn('[observability] New Relic fallback invocation failed.', error);
        }
      }
    });
    return;
  }

  queue.forEach((callback) => {
    try {
      callback(agent);
    } catch (error) {
      if (lastInitConfig?.debug) {
        console.warn('[observability] New Relic invocation failed; falling back.', error);
      }
      fallbackActive = true;
      ensureFallback();
      callback(null);
    }
  });
};

const applyGlobalAttributesToAgent = (agent: NewRelicBrowserAgent) => {
  if (!agent.setCustomAttribute) {
    return;
  }
  for (const [key, value] of Object.entries(globalAttributes)) {
    setAgentAttribute(agent, key, value);
  }
};

const scheduleInvocation = (callback: PendingInvocation) => {
  if (resolvedAgent && !fallbackActive) {
    try {
      callback(resolvedAgent);
      return;
    } catch (error) {
      if (lastInitConfig?.debug) {
        console.warn('[observability] New Relic invocation threw; enqueuing for fallback.', error);
      }
      fallbackActive = true;
      ensureFallback();
      callback(null);
      return;
    }
  }

  if (fallbackActive) {
    ensureFallback();
    callback(null);
    return;
  }

  pendingInvocations.push(callback);
};

const buildInitPayload = (config: NewRelicBrowserAgentConfig) => {
  const win = getInstrumentedWindow();
  if (!win) {
    return;
  }

  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const existingInit = asRecord(win.NREUM?.init);
  const mergedInit = {
    distributed_tracing: { enabled: true },
    page_view_timing: { enabled: true },
    privacy: { cookies_enabled: true },
    ...existingInit,
    ...(config.init ?? {}),
  } satisfies Record<string, unknown>;

  win.NREUM = win.NREUM ?? {};
  win.NREUM.init = mergedInit;
  const existingLoader = asRecord(win.NREUM.loader_config);
  win.NREUM.loader_config = {
    ...existingLoader,
    accountID: config.accountId ?? (existingLoader.accountID as string | undefined),
    trustKey:
      config.trustKey ??
      config.accountId ??
      (existingLoader.trustKey as string | undefined),
    agentID: config.agentId ?? (existingLoader.agentID as string | undefined),
    licenseKey: config.licenseKey,
    applicationID: config.applicationId,
    xpid: config.xpid ?? (existingLoader.xpid as string | undefined),
  } satisfies Record<string, unknown>;

  const existingInfo = asRecord(win.NREUM.info);
  win.NREUM.info = {
    ...existingInfo,
    beacon:
      config.beacon ??
      (existingInfo.beacon as string | undefined) ??
      DEFAULT_BEACON_HOST,
    errorBeacon:
      config.errorBeacon ??
      (existingInfo.errorBeacon as string | undefined) ??
      config.beacon ??
      DEFAULT_BEACON_HOST,
    licenseKey: config.licenseKey,
    applicationID: config.applicationId,
    sa: 1,
  } satisfies Record<string, unknown>;
};

const loadBrowserAgent = async (
  config: BrowserVendorInitConfig,
): Promise<NewRelicBrowserAgent | null> => {
  const newRelicConfig = config.newRelic;
  const win = getInstrumentedWindow();
  if (!newRelicConfig || !win || typeof document === 'undefined') {
    return null;
  }

  if (win.newrelic) {
    return win.newrelic;
  }

  buildInitPayload(newRelicConfig);

  return new Promise<NewRelicBrowserAgent | null>((resolve) => {
    const script = document.createElement('script');
    script.src = newRelicConfig.loaderScriptUrl;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'strict-origin-when-cross-origin';

    script.onload = () => {
      const agent = win.newrelic ?? null;
      resolve(agent);
    };

    script.onerror = () => {
      resolve(null);
    };

    document.head?.appendChild(script);
  });
};

const ensureAgentLoaded = (config: BrowserVendorInitConfig) => {
  if (agentPromise || fallbackActive) {
    return;
  }

  if (!config.newRelic) {
    fallbackActive = true;
    ensureFallback();
    drainPendingInvocations();
    return;
  }

  agentPromise = loadBrowserAgent(config)
    .then((agent) => {
      resolvedAgent = agent;
      if (agent) {
        applyGlobalAttributesToAgent(agent);
      } else {
        fallbackActive = true;
      }
      drainPendingInvocations();
      return agent;
    })
    .catch((error) => {
      if (config.debug) {
        console.warn('[observability] Failed to load New Relic Browser agent; using log fallback.', error);
      }
      fallbackActive = true;
      resolvedAgent = null;
      drainPendingInvocations();
      return null;
    });
};

const toError = (input: unknown) => {
  if (input instanceof Error) {
    return input;
  }
  if (typeof input === 'string') {
    return new Error(input);
  }
  return new Error('Unknown error');
};

const getSessionUrl = () => undefined;

const adapter: BrowserTelemetryAdapter = {
  init: async (config) => {
    lastInitConfig = config;
    const win = getInstrumentedWindow();
    if (!win || typeof document === 'undefined') {
      fallbackActive = true;
      ensureFallback();
      drainPendingInvocations();
      return;
    }

    if (!config.newRelic) {
      fallbackActive = true;
      if (config.debug) {
        console.warn('[observability] Missing New Relic agent config; using log fallback.');
      }
      ensureFallback();
      drainPendingInvocations();
      return;
    }

    ensureAgentLoaded(config);
    if (agentPromise) {
      try {
        const agent = await agentPromise;
        if (!agent && config.debug) {
          console.warn('[observability] New Relic agent unavailable after load; using log fallback.');
        }
      } catch (error) {
        if (config.debug) {
          console.warn('[observability] New Relic agent failed to initialize.', error);
        }
      }
    }
  },
  addAction: (event, attributes) => {
    scheduleInvocation((agent) => {
      if (agent) {
        if (event === 'page.viewed' && attributes && isRecord(attributes)) {
          applyRouteMetadata(agent, attributes);
        }
        if (agent.addPageAction) {
          try {
            agent.addPageAction(event, attributes);
            return;
          } catch (error) {
            if (lastInitConfig?.debug) {
              console.warn('[observability] Failed to record New Relic action; using fallback.', error);
            }
          }
        }
      }
      ensureFallback();
      logAdapter.addAction(event, attributes);
    });
  },
  recordException: (error, attributes) => {
    scheduleInvocation((agent) => {
      if (agent && agent.noticeError) {
        try {
          agent.noticeError(toError(error), attributes);
          return;
        } catch (err) {
          if (lastInitConfig?.debug) {
            console.warn('[observability] Failed to record New Relic error; using fallback.', err);
          }
        }
      }
      ensureFallback();
      logAdapter.recordException(error, attributes);
    });
  },
  setGlobalAttributes: (attributes) => {
    globalAttributes = {
      ...globalAttributes,
      ...attributes,
    };

    if (resolvedAgent && !fallbackActive) {
      applyGlobalAttributesToAgent(resolvedAgent);
      return;
    }
    if (fallbackActive) {
      ensureFallback();
      if (typeof logAdapter.setGlobalAttributes === 'function') {
        logAdapter.setGlobalAttributes(globalAttributes);
      }
      return;
    }
  },
  getSessionUrl,
};

export default adapter;
