import { afterEach, describe, expect, it, vi } from 'vitest';

const telemetry = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('@/lib/observability/browser', () => ({
  trackBrowserEvent: telemetry.track,
}));

describe('client log (node runtime)', () => {
  afterEach(() => {
    telemetry.track.mockClear();
  });

  it('records telemetry even when window is undefined', async () => {
    const { logEvent } = await import('@/lib/client-log');

    logEvent('test-event', { source: 'unit' });

    expect(telemetry.track).toHaveBeenCalledWith('test-event', { path: 'unknown', source: 'unit' });
  });
});
