import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('Landing analytics', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    (globalThis as any).fetch = vi.fn(async () => ({ ok: true })) as any;
  });

  it('fires analytics on hero Start Single Player', async () => {
    vi.mock('@/components/state-provider', async () => ({
      useAppState: () => ({ ready: true, height: 0 }),
    }));
    vi.mock('@/lib/state/io', async () => ({ listGames: async () => [] }));
    const { default: LandingPage } = await import('@/app/landing/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(LandingPage));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const start = Array.from(div.querySelectorAll('a')).find((a) => /Start Single Player/i.test(a.textContent || '')) as HTMLAnchorElement;
    start.click();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const calls = (globalThis.fetch as any as ReturnType<typeof vi.fn>).mock.calls;
    const last = calls.pop();
    expect(last?.[0]).toBe('/api/log');
    expect(String(last?.[1]?.body || '')).toMatch(/hero_start_single_clicked/);

    root.unmount();
    div.remove();
  });

  it('fires analytics on Multiplayer Host and Score Card Open', async () => {
    vi.mock('@/components/state-provider', async () => ({
      useAppState: () => ({ ready: true, height: 0 }),
    }));
    vi.mock('@/lib/state/io', async () => ({ listGames: async () => [] }));
    const { default: LandingPage } = await import('@/app/landing/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(LandingPage));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const host = Array.from(div.querySelectorAll('a')).find((a) => a.textContent?.trim() === 'Host') as HTMLAnchorElement;
    const open = Array.from(div.querySelectorAll('a')).find((a) => a.textContent?.trim() === 'Open') as HTMLAnchorElement;

    host.click();
    open.click();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const bodies = ((globalThis.fetch as any as ReturnType<typeof vi.fn>).mock.calls).map((c: any[]) => String(c?.[1]?.body || ''));
    expect(bodies.some((b: string) => /mode_multiplayer_host_clicked/.test(b))).toBe(true);
    expect(bodies.some((b: string) => /mode_scorecard_open_clicked/.test(b))).toBe(true);

    root.unmount();
    div.remove();
  });
});

