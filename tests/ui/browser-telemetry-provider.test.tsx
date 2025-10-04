import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

const navState = vi.hoisted(() => ({
  pathname: '/',
  search: '',
}));

const telemetryMocks = vi.hoisted(() => ({
  track: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const ensureTelemetry = vi.hoisted(() => vi.fn(async () => telemetryMocks));
const isEnabled = vi.hoisted(() => vi.fn(() => true));
const captureException = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => navState.pathname,
  useSearchParams: () => new URLSearchParams(navState.search),
}));

vi.mock('@/lib/observability/browser', () => ({
  ensureBrowserTelemetry: (...args: Parameters<typeof ensureTelemetry>) => ensureTelemetry(...args),
  isBrowserTelemetryEnabled: () => isEnabled(),
  captureBrowserException: (...args: Parameters<typeof captureException>) =>
    captureException(...args),
  captureBrowserMessage: vi.fn(),
}));

describe('BrowserTelemetryProvider', () => {
  beforeEach(() => {
    telemetryMocks.track.mockClear();
    telemetryMocks.captureException.mockClear();
    telemetryMocks.captureMessage.mockClear();
    ensureTelemetry.mockClear();
    isEnabled.mockReturnValue(true);
    captureException.mockClear();
    navState.pathname = '/';
    navState.search = '';
  });

  afterEach(() => {
    cleanup();
  });

  it('skips initialization when observability is disabled', async () => {
    isEnabled.mockReturnValue(false);
    const { BrowserTelemetryProvider } = await import('@/app/browser-telemetry-provider');
    render(
      <BrowserTelemetryProvider>
        <div>child</div>
      </BrowserTelemetryProvider>,
    );

    await Promise.resolve();

    expect(ensureTelemetry).not.toHaveBeenCalled();
    expect(telemetryMocks.track).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('initializes once and tracks unique route changes', async () => {
    const { BrowserTelemetryProvider } = await import('@/app/browser-telemetry-provider');

    const view = render(
      <BrowserTelemetryProvider>
        <div>child</div>
      </BrowserTelemetryProvider>,
    );

    await waitFor(() => {
      expect(telemetryMocks.track).toHaveBeenCalledTimes(1);
    });

    expect(ensureTelemetry).toHaveBeenCalledTimes(1);
    expect(telemetryMocks.track.mock.calls[0]?.[0]).toBe('page.viewed');
    expect(telemetryMocks.track.mock.calls[0]?.[1]).toMatchObject({ pathname: '/' });

    navState.pathname = '/players';
    navState.search = 'tab=archived';
    view.rerender(
      <BrowserTelemetryProvider>
        <div>child</div>
      </BrowserTelemetryProvider>,
    );

    await waitFor(() => {
      expect(telemetryMocks.track).toHaveBeenCalledTimes(2);
    });

    expect(telemetryMocks.track.mock.calls[1]?.[1]).toMatchObject({
      pathname: '/players',
      search: 'tab=archived',
    });
    expect(ensureTelemetry).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });
});
