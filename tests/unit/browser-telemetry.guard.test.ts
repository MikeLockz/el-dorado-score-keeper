import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captureBrowserException,
  captureBrowserMessage,
  ensureBrowserTelemetry,
  isBrowserTelemetryEnabled,
  trackBrowserEvent,
  __resetBrowserTelemetryForTests,
} from '@/lib/observability/browser';
import {
  __resetAnalyticsPreferenceForTests,
  setAnalyticsPreference,
} from '@/lib/observability/privacy';

const ORIG_ENV = { ...process.env };
const trackedEnvKeys = [
  'NEXT_PUBLIC_OBSERVABILITY_ENABLED',
  'NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_SERVICE_NAME',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_HOST',
  'NEXT_PUBLIC_APP_ENV',
  'NEXT_PUBLIC_OBSERVABILITY_PROVIDER',
  'NEXT_PUBLIC_NEW_RELIC_APP_ID',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_APP_ID',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_ACCOUNT_ID',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_TRUST_KEY',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_AGENT_ID',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_XPID',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_BEACON',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_ERROR_BEACON',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_INIT',
  'NEXT_PUBLIC_NEW_RELIC_ALLOW_DEV_AGENT',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST',
  'NEXT_PUBLIC_POSTHOG_DEBUG',
];

const originalWindow = (globalThis as { window?: Window }).window;

const browserVendor = vi.hoisted(() => ({
  init: vi.fn(),
  addAction: vi.fn(),
  recordException: vi.fn(),
  setGlobalAttributes: vi.fn(),
  getSessionUrl: vi.fn(),
}));

const customVendor = vi.hoisted(() => ({
  init: vi.fn(),
  addAction: vi.fn(),
  recordException: vi.fn(),
  setGlobalAttributes: vi.fn(),
  getSessionUrl: vi.fn(),
}));

const posthogVendor = vi.hoisted(() => ({
  init: vi.fn(),
  addAction: vi.fn(),
  recordException: vi.fn(),
  setGlobalAttributes: vi.fn(),
  getSessionUrl: vi.fn(),
}));

const syncOptOut = vi.hoisted(() => vi.fn());

const logAdapter = vi.hoisted(() => ({
  init: vi.fn(),
  addAction: vi.fn(),
  recordException: vi.fn(),
  setGlobalAttributes: vi.fn(),
  getSessionUrl: vi.fn(),
}));

vi.mock('@obs/browser-vendor/newrelic/browser-agent', () => ({
  default: browserVendor,
}));

vi.mock('@obs/browser-vendor/custom', () => ({
  default: customVendor,
}));

vi.mock('@obs/browser-vendor/posthog', () => ({
  default: posthogVendor,
}));

vi.mock('@/lib/observability/vendors/posthog', () => ({
  __esModule: true,
  default: posthogVendor,
  syncOptOut,
}));

vi.mock('@/lib/observability/vendors/newrelic/log-adapter', () => ({
  default: logAdapter,
}));

const restoreEnv = () => {
  for (const key of trackedEnvKeys) {
    const value = ORIG_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  if (typeof originalWindow === 'undefined') {
    delete (globalThis as { window?: Window }).window;
  } else {
    (globalThis as { window?: Window }).window = originalWindow;
  }
};

beforeEach(() => {
  restoreEnv();
  __resetAnalyticsPreferenceForTests();
  syncOptOut.mockClear();
  setAnalyticsPreference('enabled');
  Object.values(browserVendor).forEach((fn) => {
    if (typeof fn?.mockClear === 'function') {
      fn.mockClear();
    }
  });
  Object.values(customVendor).forEach((fn) => {
    if (typeof fn?.mockClear === 'function') {
      fn.mockClear();
    }
  });
  Object.values(posthogVendor).forEach((fn) => {
    if (typeof fn?.mockClear === 'function') {
      fn.mockClear();
    }
  });
  Object.values(logAdapter).forEach((fn) => {
    if (typeof fn?.mockClear === 'function') {
      fn.mockClear();
    }
  });
  browserVendor.getSessionUrl.mockReturnValue(undefined);
  customVendor.getSessionUrl.mockReturnValue(undefined);
  __resetBrowserTelemetryForTests();
});

afterEach(() => {
  __resetBrowserTelemetryForTests();
  restoreEnv();
});

describe('browser telemetry guards', () => {
  it('treats SSR environments as disabled', async () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY = 'key-123';
    const originalWindow = (globalThis as { window?: Window }).window;
    (globalThis as { window?: Window }).window = undefined;

    expect(isBrowserTelemetryEnabled()).toBe(false);
    const telemetry = await ensureBrowserTelemetry();
    telemetry.track('ssr-test');
    expect(browserVendor.addAction).not.toHaveBeenCalled();

    (globalThis as { window?: Window }).window = originalWindow;
  });

  it('loads browser vendor when enabled and credentials provided', async () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY = 'browser-key';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_SERVICE_NAME = 'front-end';
    process.env.NEXT_PUBLIC_APP_ENV = 'test';
    process.env.NEXT_PUBLIC_NEW_RELIC_APP_ID = 'app-123';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY = 'license-123';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL =
      'https://js-agent.newrelic.com/nr-loader-spa-1234.min.js';
    browserVendor.getSessionUrl.mockReturnValue('https://example.test/session');
    (globalThis as { window?: Window }).window = {} as Window;

    const telemetry = await ensureBrowserTelemetry();
    expect(browserVendor.init).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'browser-key',
        service: 'front-end',
        newRelic: expect.objectContaining({
          applicationId: 'app-123',
          loaderScriptUrl: 'https://js-agent.newrelic.com/nr-loader-spa-1234.min.js',
          licenseKey: 'license-123',
        }),
      }),
    );
    expect(browserVendor.setGlobalAttributes).toHaveBeenCalledWith({
      environment: 'test',
      service: 'front-end',
      'service.name': 'front-end',
    });
    expect(logAdapter.init).not.toHaveBeenCalled();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    captureBrowserException(new Error('boom'), { feature: 'players' });
    expect(browserVendor.recordException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        feature: 'players',
        environment: 'test',
        service: 'front-end',
        'service.name': 'front-end',
        sessionUrl: 'https://example.test/session',
      }),
    );

    captureBrowserMessage('page.viewed', {
      attributes: { location: '/games' },
    });
    expect(browserVendor.addAction).toHaveBeenCalledWith(
      'browser.message',
      expect.objectContaining({
        message: 'page.viewed',
        location: '/games',
        environment: 'test',
        service: 'front-end',
        'service.name': 'front-end',
      }),
    );

    telemetry.track('custom.event', { scope: 'test' });
    expect(browserVendor.addAction).toHaveBeenCalledWith(
      'custom.event',
      expect.objectContaining({
        scope: 'test',
        environment: 'test',
        service: 'front-end',
        'service.name': 'front-end',
      }),
    );

    expect(errorSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('supports switching to a custom vendor', async () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY = 'browser-key';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_SERVICE_NAME = 'front-end';
    process.env.NEXT_PUBLIC_OBSERVABILITY_PROVIDER = 'custom';
    process.env.NEXT_PUBLIC_APP_ENV = 'qa';
    (globalThis as { window?: Window }).window = {} as Window;

    const telemetry = await ensureBrowserTelemetry();

    expect(customVendor.init).toHaveBeenCalled();
    expect(browserVendor.init).not.toHaveBeenCalled();

    telemetry.track('custom-event');
    expect(customVendor.addAction).toHaveBeenCalledWith(
      'custom-event',
      expect.objectContaining({
        environment: 'qa',
        service: 'front-end',
        'service.name': 'front-end',
      }),
    );
    expect(browserVendor.addAction).not.toHaveBeenCalled();
  });

  it('degrades gracefully when config is missing', async () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    delete process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY;

    const telemetry = await ensureBrowserTelemetry();
    telemetry.track('missing-config');
    expect(browserVendor.addAction).not.toHaveBeenCalled();
    expect(customVendor.addAction).not.toHaveBeenCalled();
    expect(logAdapter.addAction).not.toHaveBeenCalled();
  });

  it('uses the log adapter in dev environments unless explicitly enabled', async () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY = 'browser-key';
    process.env.NEXT_PUBLIC_APP_ENV = 'development';
    process.env.NEXT_PUBLIC_NEW_RELIC_APP_ID = 'app-123';
    (globalThis as { window?: Window }).window = {} as Window;

    const telemetry = await ensureBrowserTelemetry();

    expect(browserVendor.init).not.toHaveBeenCalled();
    expect(logAdapter.init).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'browser-key',
        service: expect.stringContaining('el-dorado-score-keeper'),
      }),
    );

    telemetry.track('dev-event');
    expect(logAdapter.addAction).toHaveBeenCalledWith(
      'dev-event',
      expect.objectContaining({ environment: 'development' }),
    );
  });

  it('loads the PostHog adapter when provider is posthog', async () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_OBSERVABILITY_PROVIDER = 'posthog';
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_123';
    process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY = 'placeholder';
    process.env.NEXT_PUBLIC_NEW_RELIC_APP_ID = 'ignored';
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';
    (globalThis as { window?: Window }).window = {} as Window;

    const telemetry = await ensureBrowserTelemetry();
    expect(posthogVendor.init).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'phc_123',
        service: expect.any(String),
      }),
    );
    expect(posthogVendor.setGlobalAttributes).toHaveBeenCalledWith({
      environment: 'staging',
      service: expect.any(String),
      'service.name': expect.any(String),
    });

    telemetry.track('page.viewed', { path: '/rules' });
    expect(posthogVendor.addAction).toHaveBeenCalledWith(
      'page.viewed',
      expect.objectContaining({
        path: '/rules',
        environment: 'staging',
        service: expect.any(String),
        'service.name': expect.any(String),
      }),
    );

    expect(browserVendor.init).not.toHaveBeenCalled();
    expect(customVendor.init).not.toHaveBeenCalled();
  });

  it('respects analytics preference opt-out and opt-in', async () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY = 'browser-key';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_SERVICE_NAME = 'front-end';
    process.env.NEXT_PUBLIC_APP_ENV = 'test';
    process.env.NEXT_PUBLIC_NEW_RELIC_APP_ID = 'app-123';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY = 'license-123';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL =
      'https://js-agent.newrelic.com/nr-loader-spa-1234.min.js';
    (globalThis as { window?: Window }).window = {} as Window;

    await ensureBrowserTelemetry();
    browserVendor.addAction.mockClear();

    trackBrowserEvent('game.started', { game_id: 'test', mode: 'scorecard', player_count: 4 });
    expect(browserVendor.addAction).toHaveBeenCalledTimes(1);

    setAnalyticsPreference('disabled');
    browserVendor.addAction.mockClear();

    trackBrowserEvent('players.added', {
      game_id: 'test',
      added_count: 1,
      total_players: 5,
      input_method: 'manual',
    });
    expect(browserVendor.addAction).not.toHaveBeenCalled();

    setAnalyticsPreference('enabled');
    await ensureBrowserTelemetry();
    browserVendor.addAction.mockClear();

    trackBrowserEvent('round.finalized', {
      game_id: 'test',
      round_number: 1,
      scoring_variant: 'scorecard',
    });
    expect(browserVendor.addAction).toHaveBeenCalledTimes(1);
  });

  it('throws on disallowed payload keys when analytics enabled in development', async () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY = 'browser-key';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_SERVICE_NAME = 'front-end';
    process.env.NEXT_PUBLIC_APP_ENV = 'test';
    process.env.NEXT_PUBLIC_NEW_RELIC_APP_ID = 'app-123';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY = 'license-123';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL =
      'https://js-agent.newrelic.com/nr-loader-spa-1234.min.js';
    (globalThis as { window?: Window }).window = {} as Window;

    await ensureBrowserTelemetry();

    expect(() =>
      trackBrowserEvent('game.started', {
        game_id: 'abc',
        email: 'player@example.com',
      }),
    ).toThrow(/Disallowed telemetry attribute/);
  });
});
