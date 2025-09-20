import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { waitFor } from '@testing-library/react';
import { INITIAL_STATE } from '@/lib/state';
import type { GameRecord } from '@/lib/state/io';

const archiveCurrentGameAndReset = vi.hoisted(() => vi.fn(async () => null));

vi.mock('@/lib/state', async () => {
  const actual = await vi.importActual<typeof import('@/lib/state')>('@/lib/state');
  return {
    ...actual,
    archiveCurrentGameAndReset,
  };
});

type MockAppStateHook = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;

const setMockAppState = (globalThis as any).__setMockAppState as (value: MockAppStateHook) => void;
const setListGamesMock = (globalThis as any).__setListGamesMock as (
  fn: () => Promise<GameRecord[]>,
) => void;
const getMockFetch = (globalThis as any).__getMockFetch as () => ReturnType<typeof vi.fn>;

const buildAppState = () => {
  const state = JSON.parse(JSON.stringify(INITIAL_STATE));
  return {
    state,
    ready: true,
    height: 0,
    append: vi.fn(),
    appendMany: vi.fn(),
    isBatchPending: false,
    previewAt: async () => state,
    warnings: [],
    clearWarnings: () => {},
    timeTraveling: false,
  } as MockAppStateHook;
};

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('Landing analytics', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    archiveCurrentGameAndReset.mockClear();
    setListGamesMock(async () => []);
    getMockFetch().mockClear();
  });

  it('fires analytics on hero Start Single Player', async () => {
    setMockAppState(buildAppState());
    const clientLog = await import('@/lib/client-log');
    const logSpy = vi.spyOn(clientLog, 'logEvent');
    const { default: LandingPage } = await import('@/app/landing/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(LandingPage));

    await waitFor(() => {
      expect(div.querySelector('a[aria-label="Start Single Player"]')).toBeTruthy();
    });

    const start = div.querySelector('a[aria-label="Start Single Player"]') as HTMLAnchorElement;
    start.click();

    await waitFor(() => {
      expect(logSpy.mock.calls.some(([type]) => type === 'hero_start_single_clicked')).toBe(true);
    });

    root.unmount();
    div.remove();
  });

  it('fires analytics on Multiplayer Host and Score Card Open', async () => {
    setMockAppState(buildAppState());
    const clientLog = await import('@/lib/client-log');
    const logSpy = vi.spyOn(clientLog, 'logEvent');
    const { default: LandingPage } = await import('@/app/landing/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(LandingPage));

    await waitFor(() => {
      expect(
        div.querySelector(
          'section[aria-label="Open multiplayer — host a room or join by code."] [data-slot="button"]',
        ),
      ).toBeTruthy();
      expect(
        div.querySelector(
          'section[aria-label="Open score card for in-person tallying"] [data-slot="button"]',
        ),
      ).toBeTruthy();
    });

    const hostSection = div.querySelector(
      'section[aria-label="Open multiplayer — host a room or join by code."]',
    );
    const scoreSection = div.querySelector(
      'section[aria-label="Open score card for in-person tallying"]',
    );
    const host = hostSection?.querySelector('[data-slot="button"]') as
      | HTMLButtonElement
      | HTMLAnchorElement
      | null;
    const open = scoreSection?.querySelector('[data-slot="button"]') as
      | HTMLButtonElement
      | HTMLAnchorElement
      | null;
    expect(host).toBeTruthy();
    expect(open).toBeTruthy();

    host!.click();
    open!.click();

    await waitFor(() => {
      const calls = logSpy.mock.calls.map(([type]) => type);
      expect(calls).toContain('mode_multiplayer_host_clicked');
      expect(calls).toContain('mode_scorecard_open_clicked');
    });

    await waitFor(() => {
      expect(archiveCurrentGameAndReset).toHaveBeenCalled();
    });

    root.unmount();
    div.remove();
  });
});
