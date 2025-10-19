import { afterEach, describe, expect, it, vi } from 'vitest';

const telemetry = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('@/lib/observability/browser', () => {
  (globalThis as any).__clientLogTrack__ = telemetry.track;
  return {
    trackBrowserEvent: telemetry.track,
  };
});

describe('client log (node runtime)', () => {
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
