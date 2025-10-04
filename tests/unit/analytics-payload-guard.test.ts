import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assertTelemetryPropertiesSafe } from '@/lib/observability/payload-guard';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe('assertTelemetryPropertiesSafe', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it('throws when disallowed keys are present', () => {
    expect(() =>
      assertTelemetryPropertiesSafe('game.started', {
        email: 'player@example.com',
      }),
    ).toThrow(/Disallowed telemetry attribute/);
  });

  it('allows browser.exception payload fields', () => {
    expect(() =>
      assertTelemetryPropertiesSafe('browser.exception', {
        name: 'Error',
        message: 'boom',
        stack: 'stack-trace',
      }),
    ).not.toThrow();
  });

  it('allows browser.message payload fields', () => {
    expect(() =>
      assertTelemetryPropertiesSafe('browser.message', {
        message: 'render complete',
        level: 'info',
      }),
    ).not.toThrow();
  });

  it('throws when strings exceed the safe length', () => {
    const overlong = 'x'.repeat(600);
    expect(() =>
      assertTelemetryPropertiesSafe('game.started', {
        description: overlong,
      }),
    ).toThrow(/exceeds safe length/);
  });

  it('no-ops in production mode', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      assertTelemetryPropertiesSafe('game.started', {
        email: 'player@example.com',
      }),
    ).not.toThrow();
  });
});
