import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';

const suite = typeof document === 'undefined' ? describe.skip : describe;

suite('Layout skip link', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('renders a Skip to content link targeting #main', async () => {
    vi.mock('@/components/theme-provider', async () => ({
      ThemeProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
    }));
    vi.mock('@/components/state-root', async () => ({
      default: ({ children }: any) => React.createElement(React.Fragment, null, children),
    }));
    vi.mock('@/components/error-boundary', async () => ({
      AppErrorBoundary: ({ children }: any) => React.createElement(React.Fragment, null, children),
    }));
    vi.mock('@/components/devtools', async () => ({ default: () => null }));
    vi.mock('@/components/header', async () => ({ default: () => React.createElement('div', null) }));

    const { default: RootLayout } = await import('@/app/layout');
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = ReactDOM.createRoot(div);
    root.render(React.createElement(RootLayout as any, { children: React.createElement('div', null, 'Hello') }));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const skip = div.querySelector('a[href="#main"]');
    const main = div.querySelector('#main');
    expect(skip).toBeTruthy();
    expect(main).toBeTruthy();

    root.unmount();
    div.remove();
  });
});

