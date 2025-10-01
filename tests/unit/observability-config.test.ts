import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getHyperDXConfig, isObservabilityEnabled } from '@/config/observability';

const ORIGINAL_ENV = { ...process.env };

const trackedKeys = [
  'NEXT_PUBLIC_OBSERVABILITY_ENABLED',
  'NEXT_PUBLIC_HDX_API_KEY',
  'NEXT_PUBLIC_HDX_HOST',
  'NEXT_PUBLIC_HDX_SERVICE_NAME',
  'NEXT_PUBLIC_APP_ENV',
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

describe('getHyperDXConfig', () => {
  it('returns disabled config when the browser flag is false', () => {
    process.env.NEXT_PUBLIC_HDX_API_KEY = 'public-key';

    const config = getHyperDXConfig('browser');

    expect(config).toEqual({ runtime: 'browser', enabled: false });
  });

  it('returns browser config with derived defaults', () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_HDX_API_KEY = 'public-key';

    const config = getHyperDXConfig('browser');

    expect(config).toMatchObject({
      runtime: 'browser',
      enabled: true,
      apiKey: 'public-key',
      host: undefined,
      environment: 'development',
      serviceName: 'el-dorado-score-keeper-web',
    });
  });

  it('returns browser config with explicit overrides', () => {
    process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED = 'true';
    process.env.NEXT_PUBLIC_HDX_API_KEY = 'public-key';
    process.env.NEXT_PUBLIC_HDX_HOST = 'https://sandbox.hyperdx.io';
    process.env.NEXT_PUBLIC_APP_ENV = 'preview';
    process.env.NEXT_PUBLIC_HDX_SERVICE_NAME = 'custom-service';

    const config = getHyperDXConfig('browser');

    expect(config).toEqual({
      runtime: 'browser',
      enabled: true,
      apiKey: 'public-key',
      host: 'https://sandbox.hyperdx.io',
      environment: 'preview',
      serviceName: 'custom-service',
    });
  });
});
