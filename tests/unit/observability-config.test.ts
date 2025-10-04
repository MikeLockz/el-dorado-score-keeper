import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getBrowserTelemetryConfig, isObservabilityEnabled } from '@/config/observability';

const ORIGINAL_ENV = { ...process.env };

const trackedKeys = [
  'NEXT_PUBLIC_OBSERVABILITY_ENABLED',
  'NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_HOST',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_SERVICE_NAME',
  'NEXT_PUBLIC_APP_ENV',
  'NEXT_PUBLIC_NEW_RELIC_APP_ID',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_APP_ID',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL',
  'NEXT_PUBLIC_NEW_RELIC_ALLOW_DEV_AGENT',
  'NEXT_PUBLIC_OBSERVABILITY_PROVIDER',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST',
  'NEXT_PUBLIC_POSTHOG_DEBUG',
];

const restoreEnv = () => {
  for (const key of trackedKeys) {
    const originalValue = ORIGINAL_ENV[key];

    if (typeof originalValue === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }
};

beforeEach(() => {
  restoreEnv();
});

afterEach(() => {
  restoreEnv();
});

describe('isObservabilityEnabled', () => {
  it('defaults to false', () => {
    expect(isObservabilityEnabled('browser')).toBe(false);
  });

  it('respects the browser flag value', () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';

    expect(isObservabilityEnabled('browser')).toBe(true);
  });
});

describe('getBrowserTelemetryConfig', () => {
  it('returns disabled config when the browser flag is false', () => {
    process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY = 'public-key';

    const config = getBrowserTelemetryConfig('browser');

    expect(config).toEqual({ runtime: 'browser', enabled: false });
  });

  it('returns browser config with derived defaults', () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY = 'public-key';

    const config = getBrowserTelemetryConfig('browser');

    expect(config).toMatchObject({
      runtime: 'browser',
      enabled: true,
      apiKey: 'public-key',
      host: 'https://log-api.newrelic.com',
      environment: 'development',
      serviceName: 'el-dorado-score-keeper-web',
    });
  });

  it('returns browser config with explicit overrides', () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY = 'public-key';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_HOST = 'https://observability.example';
    process.env.NEXT_PUBLIC_APP_ENV = 'preview';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_SERVICE_NAME = 'custom-service';

    const config = getBrowserTelemetryConfig('browser');

    expect(config).toEqual({
      runtime: 'browser',
      enabled: true,
      apiKey: 'public-key',
      host: 'https://observability.example',
      environment: 'preview',
      serviceName: 'custom-service',
    });
  });

  it('derives agent configuration when New Relic script metadata is present', () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY = 'browser-license-key';
    process.env.NEXT_PUBLIC_NEW_RELIC_APP_ID = 'app-id';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL =
      'https://js-agent.newrelic.com/loader.js';
    process.env.NEXT_PUBLIC_APP_ENV = 'production';

    const config = getBrowserTelemetryConfig('browser');

    expect(config).toMatchObject({
      newRelic: {
        applicationId: 'app-id',
        licenseKey: 'browser-license-key',
        loaderScriptUrl: 'https://js-agent.newrelic.com/loader.js',
      },
    });
  });

  it('returns PostHog config when the provider is posthog', () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_OBSERVABILITY_PROVIDER = 'posthog';
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.posthog.com';
    process.env.NEXT_PUBLIC_POSTHOG_DEBUG = 'true';

    const config = getBrowserTelemetryConfig('browser');

    expect(config).toEqual({
      runtime: 'browser',
      enabled: true,
      apiKey: 'phc_test',
      host: 'https://eu.posthog.com',
      environment: 'development',
      serviceName: 'el-dorado-score-keeper-web',
      debug: true,
      posthog: {
        apiKey: 'phc_test',
        host: 'https://eu.posthog.com',
        debug: true,
      },
    });
  });

  it('includes PostHog details when using the custom provider', () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_OBSERVABILITY_PROVIDER = 'custom';
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_456';
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://us.i.posthog.com';
    process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY = 'nr-license';

    const config = getBrowserTelemetryConfig('browser');

    expect(config).toMatchObject({
      runtime: 'browser',
      enabled: true,
      apiKey: 'nr-license',
      posthog: {
        apiKey: 'phc_456',
        host: 'https://us.i.posthog.com',
        debug: false,
      },
    });
  });

  it('falls back to the default loader script when none is configured explicitly', () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY = 'public-license';
    process.env.NEXT_PUBLIC_NEW_RELIC_APP_ID = 'app-id';
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    delete process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL;

    const config = getBrowserTelemetryConfig('browser');

    expect(config).toMatchObject({
      newRelic: {
        applicationId: 'app-id',
        licenseKey: 'public-license',
        loaderScriptUrl: 'https://js-agent.newrelic.com/nr-loader-spa-current.min.js',
      },
    });
  });

  it('skips the browser agent in dev-like environments by default', () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY = 'public-license';
    process.env.NEXT_PUBLIC_NEW_RELIC_APP_ID = 'app-id';
    process.env.NEXT_PUBLIC_APP_ENV = 'development';

    const config = getBrowserTelemetryConfig('browser');

    expect(config.runtime).toBe('browser');
    expect(config.enabled).toBe(true);
    expect(config.newRelic).toBeUndefined();
  });

  it('allows enabling the browser agent in dev-like environments via override', () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY = 'public-license';
    process.env.NEXT_PUBLIC_NEW_RELIC_APP_ID = 'app-id';
    process.env.NEXT_PUBLIC_APP_ENV = 'development';
    process.env.NEXT_PUBLIC_NEW_RELIC_ALLOW_DEV_AGENT = 'true';

    const config = getBrowserTelemetryConfig('browser');

    expect(config.newRelic).toMatchObject({
      applicationId: 'app-id',
      loaderScriptUrl: 'https://js-agent.newrelic.com/nr-loader-spa-current.min.js',
    });
  });

  it('normalizes beacon endpoints when the dev agent override is enabled', () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY = 'public-license';
    process.env.NEXT_PUBLIC_NEW_RELIC_APP_ID = 'app-id';
    process.env.NEXT_PUBLIC_APP_ENV = 'development';
    process.env.NEXT_PUBLIC_NEW_RELIC_ALLOW_DEV_AGENT = 'true';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_BEACON = 'http://localhost:5050/';
    process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_ERROR_BEACON = 'https://localhost:5050';

    const config = getBrowserTelemetryConfig('browser');

    expect(config.newRelic).toMatchObject({
      beacon: 'localhost:5050',
      errorBeacon: 'localhost:5050',
      init: expect.objectContaining({ ssl: false }),
    });
  });
});
