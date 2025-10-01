import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captureBrowserException,
  captureBrowserMessage,
  ensureBrowserTelemetry,
  isBrowserTelemetryEnabled,
  __resetBrowserTelemetryForTests,
} from '@/lib/observability/browser';

const ORIG_ENV = { ...process.env };
const trackedEnvKeys = [
  'NEXT_PUBLIC_OBSERVABILITY_ENABLED',
  'NEXT_PUBLIC_HDX_API_KEY',
  'NEXT_PUBLIC_HDX_SERVICE_NAME',
  'NEXT_PUBLIC_HDX_HOST',
  'NEXT_PUBLIC_APP_ENV',
];

const originalWindow = (globalThis as { window?: Window }).window;

const hyperdx = vi.hoisted(() => ({
  init: vi.fn(),
  addAction: vi.fn(),
  recordException: vi.fn(),
  setGlobalAttributes: vi.fn(),
  getSessionUrl: vi.fn(),
}));

vi.mock('@hyperdx/browser', () => ({
  default: hyperdx,
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
  Object.values(hyperdx).forEach((fn) => {
    if (typeof fn?.mockClear === 'function') {
      fn.mockClear();
    }
  });
  hyperdx.getSessionUrl.mockReturnValue(undefined);
  __resetBrowserTelemetryForTests();
});

afterEach(() => {
  __resetBrowserTelemetryForTests();
  restoreEnv();
});

describe('browser telemetry guards', () => {
  it('treats SSR environments as disabled', async () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_HDX_API_KEY = 'key-123';
    const originalWindow = (globalThis as { window?: Window }).window;
    (globalThis as { window?: Window }).window = undefined;

    expect(isBrowserTelemetryEnabled()).toBe(false);
    const telemetry = await ensureBrowserTelemetry();
    telemetry.track('ssr-test');
    expect(hyperdx.addAction).not.toHaveBeenCalled();

    (globalThis as { window?: Window }).window = originalWindow;
  });

  it('loads HyperDX when enabled and credentials provided', async () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_HDX_API_KEY = 'browser-key';
    process.env.NEXT_PUBLIC_HDX_SERVICE_NAME = 'front-end';
    process.env.NEXT_PUBLIC_APP_ENV = 'test';
    hyperdx.getSessionUrl.mockReturnValue('https://example.test/session');
    (globalThis as { window?: Window }).window = {} as Window;

    const telemetry = await ensureBrowserTelemetry();
    expect(hyperdx.init).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'browser-key',
        service: 'front-end',
      }),
    );
    expect(hyperdx.setGlobalAttributes).toHaveBeenCalledWith({
      environment: 'test',
      service: 'front-end',
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    captureBrowserException(new Error('boom'), { feature: 'players' });
    expect(hyperdx.recordException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        feature: 'players',
        environment: 'test',
        service: 'front-end',
        sessionUrl: 'https://example.test/session',
      }),
    );

    captureBrowserMessage('page.viewed', {
      attributes: { location: '/games' },
    });
    expect(hyperdx.addAction).toHaveBeenCalledWith(
      'browser.message',
      expect.objectContaining({
        message: 'page.viewed',
        location: '/games',
        environment: 'test',
      }),
    );

    telemetry.track('custom.event', { scope: 'test' });
    expect(hyperdx.addAction).toHaveBeenCalledWith(
      'custom.event',
      expect.objectContaining({ scope: 'test', environment: 'test' }),
    );

    expect(errorSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('degrades gracefully when config is missing', async () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    delete process.env.NEXT_PUBLIC_HDX_API_KEY;

    const telemetry = await ensureBrowserTelemetry();
    telemetry.track('missing-config');
    expect(hyperdx.addAction).not.toHaveBeenCalled();
  });
});
