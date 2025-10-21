import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const telemetry = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('@/lib/observability/browser', () => {
  return {
    trackBrowserEvent: telemetry.track,
  };
});

describe('client log (node runtime)', () => {
  beforeEach(() => {
    // Clear any existing global override
    delete (globalThis as any).__clientLogTrack__;
    // Set our mock as the global override
    (globalThis as any).__clientLogTrack__ = telemetry.track;
  });

  afterEach(() => {
    telemetry.track.mockClear();
    delete (globalThis as any).__clientLogTrack__;
  });

  it('records telemetry even when window is undefined', async () => {
    const { logEvent } = await import('@/lib/client-log');

    logEvent('test-event', { source: 'unit' });

    expect(telemetry.track).toHaveBeenCalledWith('test-event', { path: 'unknown', source: 'unit' });
  });
});
