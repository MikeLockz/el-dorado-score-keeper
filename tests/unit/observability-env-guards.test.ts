import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getHyperDXConfig } from '@/config/observability';

const ORIGINAL_ENV = { ...process.env };

const trackedKeys = [
  'NEXT_PUBLIC_OBSERVABILITY_ENABLED',
  'NEXT_PUBLIC_HDX_API_KEY',
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

    expect(() => getHyperDXConfig('browser')).toThrowError(
      'NEXT_PUBLIC_HDX_API_KEY must be defined when browser observability is enabled',
    );
  });
});
