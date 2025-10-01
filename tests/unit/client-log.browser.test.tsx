import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const telemetry = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('@/lib/observability/browser', () => ({
  trackBrowserEvent: telemetry.track,
}));

describe('client log (browser runtime)', () => {
  let restoreConsole: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    telemetry.track.mockClear();
    const originalInfo = console.info;
    const infoMock = vi.fn();
    console.info = infoMock as unknown as typeof console.info;
    restoreConsole = () => {
      console.info = originalInfo;
    };
  });

  afterEach(() => {
    restoreConsole?.();
    restoreConsole = null;
  });

  it('tracks events with path metadata', async () => {
    const { logEvent } = await import('@/lib/client-log');

    logEvent('cta.click', { variant: 'hero' });

    expect(telemetry.track).toHaveBeenCalledWith(
      'cta.click',
      expect.objectContaining({
        path: `${location.pathname}${location.search}`,
        variant: 'hero',
      }),
    );
  });
});
