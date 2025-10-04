import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getBrowserTelemetryConfig } from '@/config/observability';

const ORIGINAL_ENV = { ...process.env };

const trackedKeys = [
  'NEXT_PUBLIC_OBSERVABILITY_ENABLED',
  'NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY',
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

describe('observability env guards', () => {
  it('throws when browser observability is enabled without a public API key', () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';

    expect(() => getBrowserTelemetryConfig('browser')).toThrowError(
      'NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY must be defined when browser observability is enabled',
    );
  });

  it('allows custom providers to skip the New Relic license key', () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_OBSERVABILITY_PROVIDER = 'custom';

    expect(getBrowserTelemetryConfig('browser')).toEqual({
      runtime: 'browser',
      enabled: true,
      apiKey: 'el-dorado-score-keeper-web',
      host: 'https://log-api.newrelic.com',
      environment: 'development',
      serviceName: 'el-dorado-score-keeper-web',
    });
  });
});
