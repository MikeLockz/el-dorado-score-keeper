import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('Landing Page UI', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('renders hero and primary CTAs with correct links', async () => {
    vi.mock('@/components/state-provider', async () => ({
      useAppState: () => ({ ready: true, height: 0 }),
    }));
    vi.mock('@/lib/state/io', async () => ({
      listGames: async () => [],
    }));
    const { default: LandingPage } = await import('@/app/landing/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(LandingPage));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const text = div.textContent || '';
    expect(text).toMatch(/Set Out for El Dorado/);
    expect(text).toMatch(/Start Single Player/);
    expect(text).toMatch(/Host Game/);
    expect(text).toMatch(/Open Score Card/);

    const links = Array.from(div.querySelectorAll('a')) as HTMLAnchorElement[];
    const single = links.find((a) => /Start Single Player/i.test(a.textContent || ''))!;
    const host = links.find((a) => /Host Game/i.test(a.textContent || ''))!;
    const score = links.find((a) => /Open Score Card/i.test(a.textContent || ''))!;

    expect(single?.getAttribute('href')).toBe('/single-player');
    expect(host?.getAttribute('href')).toBe('/rules');
    expect(score?.getAttribute('href')).toBe('/');

    root.unmount();
    div.remove();
  });

  it('exposes aria-labels on mode cards', async () => {
    vi.mock('@/components/state-provider', async () => ({
      useAppState: () => ({ ready: true, height: 0 }),
    }));
    vi.mock('@/lib/state/io', async () => ({
      listGames: async () => [],
    }));
    const { default: LandingPage } = await import('@/app/landing/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(LandingPage));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const sections = Array.from(div.querySelectorAll('section[aria-label]')) as HTMLElement[];
    const labels = sections.map((s) => s.getAttribute('aria-label'));
    expect(labels.join(' ')).toMatch(/single player/i);
    expect(labels.join(' ')).toMatch(/multiplayer/i);
    expect(labels.join(' ')).toMatch(/score card/i);

    root.unmount();
    div.remove();
  });

  it('shows Resume and recents when available', async () => {
    vi.mock('@/components/state-provider', async () => ({
      useAppState: () => ({ ready: true, height: 5 }),
    }));
    vi.mock('@/lib/state/io', async () => ({
      listGames: async () => [
        {
          id: 'a',
          title: 'Alpha',
          createdAt: 1,
          finishedAt: 2,
          lastSeq: 1,
          summary: {
            players: 0,
            scores: {},
            playersById: {},
            winnerId: null,
            winnerName: null,
            winnerScore: null,
          },
          bundle: { latestSeq: 0, events: [] },
        },
        {
          id: 'b',
          title: 'Beta',
          createdAt: 3,
          finishedAt: 4,
          lastSeq: 1,
          summary: {
            players: 0,
            scores: {},
            playersById: {},
            winnerId: null,
            winnerName: null,
            winnerScore: null,
          },
          bundle: { latestSeq: 0, events: [] },
        },
        {
          id: 'c',
          title: 'Gamma',
          createdAt: 5,
          finishedAt: 6,
          lastSeq: 1,
          summary: {
            players: 0,
            scores: {},
            playersById: {},
            winnerId: null,
            winnerName: null,
            winnerScore: null,
          },
          bundle: { latestSeq: 0, events: [] },
        },
      ],
    }));
    const { default: LandingPage } = await import('@/app/landing/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(LandingPage));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const resume = Array.from(div.querySelectorAll('a')).find((a) =>
      /Resume current game/i.test(a.textContent || ''),
    ) as HTMLAnchorElement;
    expect(resume).toBeTruthy();
    expect(resume.getAttribute('href')).toBe('/');

    const alpha = div.querySelector('a[href="/games/view?id=a"]') as HTMLAnchorElement;
    const beta = div.querySelector('a[href="/games/view?id=b"]') as HTMLAnchorElement;
    const gamma = div.querySelector('a[href="/games/view?id=c"]') as HTMLAnchorElement;
    expect(alpha && beta && gamma).toBeTruthy();
    const viewAll = div.querySelector('a[href="/games"]');
    expect(viewAll).toBeTruthy();

    root.unmount();
    div.remove();
  });

  it('shows empty copy without recents', async () => {
    vi.mock('@/components/state-provider', async () => ({
      useAppState: () => ({ ready: true, height: 0 }),
    }));
    vi.mock('@/lib/state/io', async () => ({
      listGames: async () => [],
    }));
    const { default: LandingPage } = await import('@/app/landing/page');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(LandingPage));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const text = div.textContent || '';
    expect(text).toMatch(/Your games will appear here\./i);

    root.unmount();
    div.remove();
  });
});
