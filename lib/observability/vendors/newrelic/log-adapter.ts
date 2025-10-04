import type { BrowserTelemetryAdapter, BrowserVendorInitConfig } from '@/lib/observability/vendors/types';

const DEFAULT_ENDPOINT = 'https://log-api.newrelic.com';

type PendingLog = {
  message: string;
  attributes?: Record<string, unknown>;
};

type InternalConfig = {
  apiKey: string;
  endpoint: string;
  service: string;
  debug: boolean;
};

let config: InternalConfig | null = null;
let globalAttributes: Record<string, string> = {};
let pendingQueue: PendingLog[] = [];
let draining = false;

const getFetch = () => {
  if (typeof fetch === 'function') return fetch.bind(globalThis);
  return null;
};

const flushQueue = async () => {
  if (!config || !pendingQueue.length) return;
  if (draining) return;
  const boundFetch = getFetch();
  if (!boundFetch) return;

  draining = true;
  const queue = [...pendingQueue];
  pendingQueue = [];

  const payload = queue.map(({ message, attributes }) => ({
    common: {
      attributes: {
        'service.name': config!.service,
        ...globalAttributes,
      },
    },
    logs: [
      {
        timestamp: Date.now(),
        message,
        attributes: attributes ?? {},
      },
    ],
  }));

  try {
    const response = await boundFetch(`${config.endpoint.replace(/\/$/, '')}/log/v1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': config.apiKey,
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });

    if (!response.ok && config.debug) {
      console.warn(
        '[observability] Failed to send New Relic payload',
        response.status,
        response.statusText,
      );
    }
  } catch (error) {
    if (config.debug) {
      console.warn('[observability] Error sending data to New Relic', error);
    }
  } finally {
    draining = false;
  }
};

const enqueue = (message: string, attributes?: Record<string, unknown>) => {
  if (!config) return;
  const payload: PendingLog = { message };
  if (attributes !== undefined) {
    payload.attributes = attributes;
  }
  pendingQueue.push(payload);
  if (typeof navigator?.sendBeacon === 'function') {
    setTimeout(() => {
      void flushQueue();
    }, 0);
  } else {
    void flushQueue();
  }
};

const recordException = (error: unknown, attributes?: Record<string, unknown>) => {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  enqueue('browser.exception', {
    ...attributes,
    'error.message': message,
    'error.stack': error instanceof Error ? error.stack : undefined,
  });
};

const addAction = (event: string, attributes?: Record<string, unknown>) => {
  enqueue(event, attributes);
};

const init = (input: BrowserVendorInitConfig) => {
  config = {
    apiKey: input.apiKey,
    endpoint: input.url || DEFAULT_ENDPOINT,
    service: input.service,
    debug: Boolean(input.debug),
  };

  if (input.consoleCapture) {
    try {
      const originalError = console.error.bind(console);
      console.error = (...args: unknown[]) => {
        enqueue('console.error', { arguments: args });
        originalError(...args);
      };
    } catch (error) {
      if (config.debug) {
        console.warn('[observability] Failed to enable console capture', error);
      }
    }
  }

  void flushQueue();
};

const setGlobalAttributes = (attributes: Record<string, string>) => {
  globalAttributes = {
    ...globalAttributes,
    ...attributes,
  };
};

const getSessionUrl = () => undefined;

const NewRelicBrowser: BrowserTelemetryAdapter = {
  init,
  addAction,
  recordException,
  setGlobalAttributes,
  getSessionUrl,
};

export default NewRelicBrowser;
