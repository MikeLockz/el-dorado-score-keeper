import { describe, it, expect } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('Landing Page UI', () => {
  it('renders hero and primary CTAs with correct links', async () => {
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
});

