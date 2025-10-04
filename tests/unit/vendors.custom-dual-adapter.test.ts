import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  BrowserTelemetryAdapter,
  BrowserVendorInitConfig,
} from '@/lib/observability/vendors/types';

const newRelicAdapter = vi.hoisted(() => ({
  init: vi.fn(),
  addAction: vi.fn(),
  recordException: vi.fn(),
  setGlobalAttributes: vi.fn(),
  getSessionUrl: vi.fn(),
}));

const posthogAdapter = vi.hoisted(() => ({
  init: vi.fn(),
  addAction: vi.fn(),
  recordException: vi.fn(),
  setGlobalAttributes: vi.fn(),
  getSessionUrl: vi.fn(),
}));

vi.mock('@obs/browser-vendor/newrelic/browser-agent', () => ({
  __esModule: true,
  default: newRelicAdapter,
}));

vi.mock('@obs/browser-vendor/posthog', () => ({
  __esModule: true,
  default: posthogAdapter,
}));

let customAdapter: BrowserTelemetryAdapter;

beforeAll(async () => {
  customAdapter = (await import('@/lib/observability/vendors/custom')).default;
});

describe('custom dual telemetry adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    newRelicAdapter.getSessionUrl.mockReturnValue(undefined);
    posthogAdapter.getSessionUrl.mockReturnValue(undefined);
  });

  it('initialises both PostHog and New Relic when configuration provided', async () => {
    const config: BrowserVendorInitConfig = {
      apiKey: 'nr-license',
      service: 'el-dorado-score-keeper-web',
      url: 'https://log-api.newrelic.com',
      consoleCapture: true,
      debug: true,
      newRelic: {
        applicationId: 'app-id',
        licenseKey: 'nr-license',
        loaderScriptUrl: 'https://js-agent.newrelic.com/nr-loader-spa-current.min.js',
      },
      posthog: {
        apiKey: 'phc_test',
        host: 'https://us.i.posthog.com',
        debug: false,
      },
    };

    await customAdapter.init(config);

    expect(newRelicAdapter.init).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'nr-license',
        service: 'el-dorado-score-keeper-web',
        url: 'https://log-api.newrelic.com',
      }),
    );
    expect(posthogAdapter.init).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'phc_test',
        service: 'el-dorado-score-keeper-web',
        url: 'https://us.i.posthog.com',
      }),
    );
  });

  it('fans out telemetry operations to both adapters', () => {
    const attributes = { path: '/', env: 'test' };

    customAdapter.setGlobalAttributes({ service: 'web', env: 'test' });
    customAdapter.addAction('page.viewed', attributes);
    customAdapter.recordException(new Error('boom'), attributes);

    expect(newRelicAdapter.setGlobalAttributes).toHaveBeenCalledWith({ service: 'web', env: 'test' });
    expect(posthogAdapter.setGlobalAttributes).toHaveBeenCalledWith({ service: 'web', env: 'test' });

    expect(newRelicAdapter.addAction).toHaveBeenCalledWith('page.viewed', attributes);
    expect(posthogAdapter.addAction).toHaveBeenCalledWith('page.viewed', attributes);

    expect(newRelicAdapter.recordException).toHaveBeenCalled();
    expect(posthogAdapter.recordException).toHaveBeenCalled();
  });

  it('prefers the PostHog session URL when available', () => {
    newRelicAdapter.getSessionUrl.mockReturnValue('https://nr.example/session');
    posthogAdapter.getSessionUrl.mockReturnValue('https://ph.example/session');

    const result = customAdapter.getSessionUrl?.();

    expect(result).toBe('https://ph.example/session');
  });

  it('skips New Relic initialisation when no license key present', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const config: BrowserVendorInitConfig = {
      apiKey: 'el-dorado-score-keeper-web',
      service: 'el-dorado-score-keeper-web',
      consoleCapture: false,
      debug: false,
      posthog: {
        apiKey: 'phc_test',
      },
    };

    await customAdapter.init(config);

    expect(newRelicAdapter.init).not.toHaveBeenCalled();
    expect(posthogAdapter.init).toHaveBeenCalled();

    infoSpy.mockRestore();
  });
});
