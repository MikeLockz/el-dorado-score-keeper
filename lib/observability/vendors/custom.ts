import newRelicAdapter from '@obs/browser-vendor/newrelic/browser-agent';
import posthogAdapter from '@obs/browser-vendor/posthog';
import type {
  BrowserTelemetryAdapter,
  BrowserVendorInitConfig,
} from '@/lib/observability/vendors/types';

type InitResult = void | Promise<void> | Promise<unknown>;

const hasExplicitNewRelicKey = (config: BrowserVendorInitConfig) => {
  if (config.newRelic) {
    return true;
  }

  if (!config.apiKey) {
    return false;
  }

  // When no explicit New Relic key is provided, `config.apiKey` falls back to the service name.
  if (config.apiKey === config.service) {
    return false;
  }

  return true;
};

const buildNewRelicInit = (config: BrowserVendorInitConfig): BrowserVendorInitConfig | null => {
  if (!hasExplicitNewRelicKey(config)) {
    return null;
  }

  const base: BrowserVendorInitConfig = {
    apiKey: config.apiKey,
    service: config.service,
  };
  if (typeof config.url === 'string') {
    base.url = config.url;
  }
  if (typeof config.consoleCapture === 'boolean') {
    base.consoleCapture = config.consoleCapture;
  }
  if (typeof config.debug === 'boolean') {
    base.debug = config.debug;
  }
  if (config.newRelic) {
    base.newRelic = config.newRelic;
  }
  return base;
};

const buildPosthogInit = (config: BrowserVendorInitConfig): BrowserVendorInitConfig | null => {
  const posthog = config.posthog;
  if (!posthog?.apiKey) {
    return null;
  }

  const base: BrowserVendorInitConfig = {
    apiKey: posthog.apiKey,
    service: config.service,
    posthog,
  };
  if (typeof posthog.host === 'string') {
    base.url = posthog.host;
  }
  if (typeof config.consoleCapture === 'boolean') {
    base.consoleCapture = config.consoleCapture;
  }
  if (typeof posthog.debug === 'boolean') {
    base.debug = posthog.debug;
  } else if (typeof config.debug === 'boolean') {
    base.debug = config.debug;
  }
  return base;
};

const toPromise = (result: InitResult): Promise<void> | null => {
  if (!result) {
    return null;
  }
  if (typeof (result as Promise<unknown>).then === 'function') {
    return (result as Promise<unknown>).then(() => undefined);
  }
  return null;
};

const callSafely = (action: () => void) => {
  try {
    action();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[observability] Dual adapter invocation failed.', error);
    }
  }
};

const DualTelemetryAdapter: BrowserTelemetryAdapter = {
  init(config) {
    const tasks: Promise<void>[] = [];

    const newRelicConfig = buildNewRelicInit(config);
    if (newRelicConfig) {
      const result = newRelicAdapter.init(newRelicConfig);
      const promise = toPromise(result);
      if (promise) {
        tasks.push(promise);
      }
    } else if (process.env.NODE_ENV !== 'production') {
      console.info(
        '[observability] Dual adapter: skipping New Relic initialisation (missing key).',
      );
    }

    const posthogConfig = buildPosthogInit(config);
    if (posthogConfig) {
      const result = posthogAdapter.init(posthogConfig);
      const promise = toPromise(result);
      if (promise) {
        tasks.push(promise);
      }
    } else if (process.env.NODE_ENV !== 'production') {
      console.warn('[observability] Dual adapter: missing PostHog configuration.');
    }

    if (tasks.length) {
      return Promise.allSettled(tasks).then(() => undefined);
    }

    return undefined;
  },

  setGlobalAttributes(attributes) {
    callSafely(() => newRelicAdapter.setGlobalAttributes?.(attributes));
    callSafely(() => posthogAdapter.setGlobalAttributes?.(attributes));
  },

  addAction(event, attributes) {
    callSafely(() => newRelicAdapter.addAction(event, attributes));
    callSafely(() => posthogAdapter.addAction(event, attributes));
  },

  recordException(error, attributes) {
    callSafely(() => newRelicAdapter.recordException(error, attributes));
    callSafely(() => posthogAdapter.recordException(error, attributes));
  },

  getSessionUrl() {
    const posthogSession = posthogAdapter.getSessionUrl?.();
    if (posthogSession) {
      return posthogSession;
    }
    return newRelicAdapter.getSessionUrl?.();
  },
};

export default DualTelemetryAdapter;
